import { transact } from './cloudStore';
import { cloudStore } from './cloudStore';
import { repo, LocalRepository } from './repository';
import { hashImage } from '../ocr/engine';
import { createOcrSession, ocrConcurrency } from '../ocr/session';
import { optimizeImage } from '../ocr/optimize';
import { captureActivity } from './captureActivity';
import { placementFromText, type ParsedTicket } from '../ocr/parser';
import { settledTicketHeader } from '../ocr/header';
import { placementReviewReason } from '../ocr/placement';
import { interpretSelections, semanticReviewReasons } from '../ocr/semanticReview';
import { readCapture } from '../ocr/readCapture';
import { runBatch } from './batch';
import {
  readDraft,
  readPlacementHistory,
  needsNewProof,
  reviewSelectionSchema,
  type ReviewDraft,
} from '../ocr/review';
import { id, timestamp, fingerprint, betSchema, selectionSchema, type Bet } from '../domain/model';

export async function enqueueCaptures(
  files: File[],
  repository = repo,
  report?: (label: string) => void,
  proofFor?: string,
) {
  const d = repository.database;
  const generation = cloudStore.generation;
  const guard = () => {
    if (repository === repo && generation !== cloudStore.generation)
      throw new Error('La sesión cambió. Vuelve a iniciar la carga.');
  };
  let completed = 0;
  report?.(`Preparando lote · 0/${files.length}`);
  const results = await runBatch(files, 2, async (file) => {
    guard();
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 15 * 1024 * 1024
      )
        throw new Error('Usa imágenes PNG, JPEG o WebP de hasta 15 MB.');
      const key = id(),
        originalHash = await hashImage(file);
      const known = await d.images
        .filter((i) => i.hash === originalHash || i.originalHash === originalHash)
        .first();
      const optimized = known ? { blob: file } : await optimizeImage(file);
      const hash = known?.hash ?? (await hashImage(optimized.blob));
      guard();
      await transact(d, 'rw', [d.uploads, d.images, d.bets, d.audit], async (d) => {
        guard();
        const parent = proofFor ? await d.uploads.get(proofFor) : undefined;
        if (proofFor && (!parent || !['review', 'error'].includes(parent.status)))
          throw new Error('El borrador de origen cambió. Vuelve a abrirlo.');
        const sameImages = await d.images
          .filter(
            (i) => i.hash === hash || i.hash === originalHash || i.originalHash === originalHash,
          )
          .primaryKeys();
        const existing = await d.bets
          .filter((b) => !!b.imageId && sameImages.includes(b.imageId))
          .first();
        const imageId = sameImages[0] ?? key;
        if (parent && sameImages.includes(parent.imageId))
          throw new Error(
            'Es la misma imagen. Añade un comprobante diferente que muestre la apuesta aceptada.',
          );
        // A new queue item for identical pixels must retain earlier placement
        // uncertainty; changing the filename is not new evidence.
        const previousRead = sameImages.length
          ? await d.uploads.filter((u) => sameImages.includes(u.imageId) && !!u.draftJson).first()
          : undefined;
        if (!sameImages.length)
          await d.images.add({
            id: imageId,
            name: file.name,
            hash,
            originalHash,
            blob: optimized.blob,
            bytes: optimized.blob.size,
            originalBytes: file.size,
            width: optimized.width,
            height: optimized.height,
          });
        await d.uploads.add({
          id: key,
          imageId,
          createdAt: timestamp(),
          status: existing ? 'duplicate' : 'queued',
          progress: 0,
          draftJson: previousRead?.draftJson ?? '',
          reason: existing ? 'Esta imagen ya está registrada. No se ha vuelto a ejecutar OCR.' : '',
          betId: existing?.id,
        });
        if (parent)
          await d.audit.add({
            id: id(),
            date: timestamp(),
            action: 'Añadir comprobante independiente',
            entityId: key,
            before: JSON.stringify({ uploadId: parent.id, imageId: parent.imageId }),
            after: JSON.stringify({
              uploadId: key,
              imageId,
              proofFor: parent.id,
              placementTransferred: false,
            }),
          });
      });
    } finally {
      completed++;
      report?.(`Procesando carga · ${completed}/${files.length}`);
    }
  });
  return {
    added: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.flatMap((r, i) =>
      r.status === 'rejected'
        ? [
            {
              file: files[i],
              error: r.reason instanceof Error ? r.reason.message : String(r.reason),
            },
          ]
        : [],
    ),
  };
}

// An OCR upload records an already placed bet, not a request to spend money.
// Missing bankroll therefore stays a visible reconciliation deficit.
export async function registerCapture(
  uploadId: string,
  parsed: ParsedTicket,
  repository: LocalRepository = repo,
) {
  return processCapture(uploadId, parsed, repository);
}

export interface CaptureReviewConfirmation {
  expectedDraft: string;
  imageId: string;
  selections: ParsedTicket['selections'];
  acknowledged: boolean;
}
export async function confirmCaptureReview(
  uploadId: string,
  confirmation: CaptureReviewConfirmation,
  repository = repo,
) {
  return processCapture(uploadId, undefined, repository, confirmation);
}

async function processCapture(
  uploadId: string,
  input: ParsedTicket | undefined,
  repository: LocalRepository,
  confirmation?: CaptureReviewConfirmation,
) {
  const d = repository.database;
  await transact(d, 'rw', d.tables, async (d) => {
    const scopedRepository = new LocalRepository(d);
    const upload = await d.uploads.get(uploadId);
    if (
      confirmation &&
      (!upload ||
        upload.status !== 'review' ||
        upload.draftJson !== confirmation.expectedDraft ||
        upload.imageId !== confirmation.imageId)
    )
      throw new Error('El borrador cambió. Vuelve a abrir la revisión.');
    if (!upload || upload.status === 'saved' || upload.status === 'linked') return;
    const previous = readDraft(upload.draftJson);
    let parsed: ReviewDraft;
    if (confirmation) {
      if (!confirmation.acknowledged)
        throw new Error('Confirma explícitamente que cotejaste los datos con la imagen.');
      if (!previous || needsNewProof(previous))
        throw new Error('Añade un comprobante de colocación antes de revisar datos.');
      const selections = confirmation.selections.map((row) => {
        const s = reviewSelectionSchema.parse(row);
        return {
          ...s,
          promotion: s.promotion || undefined,
          builderMarkets: s.builderMarkets?.map((m) => ({
            ...m,
            promotion: m.promotion || undefined,
          })),
        };
      });
      if (
        selections.length !== previous.selections.length ||
        selections.some(
          (s, i) =>
            (s.builderMarkets?.length ?? 0) !==
            (previous.selections[i].builderMarkets?.length ?? 0),
        )
      )
        throw new Error(
          'No se pueden omitir ni añadir selecciones en esta revisión. Añade una captura completa.',
        );
      parsed = { ...previous, selections, humanReviewed: true };
    } else parsed = input!;
    // The original is already stored. Registration needs its metadata, not a
    // second Storage download of the pixels we have just recognized.
    const image = await d.images.where('id').equals(upload.imageId).first();
    if (!image) throw new Error('No se encuentra la captura original.');
    const placement = placementFromText(parsed.text);
    const previousHistory = readPlacementHistory(upload.draftJson);
    const priorPlacement = previousHistory && placementFromText(previousHistory.text);
    const samePixels = await d.images
      .filter(
        (i) =>
          i.hash === image.hash || (!!image.originalHash && i.originalHash === image.originalHash),
      )
      .primaryKeys();
    const siblingDrafts = (
      await d.uploads
        .filter((u) => u.id !== uploadId && samePixels.includes(u.imageId) && !!u.draftJson)
        .toArray()
    ).map((u) => readPlacementHistory(u.draftJson));
    const holds = [
      previousHistory?.placementHold,
      priorPlacement && priorPlacement.status !== 'confirmed'
        ? { text: previousHistory!.text }
        : undefined,
      placement.status !== 'confirmed' ? { text: parsed.text } : undefined,
      ...siblingDrafts.flatMap((draft) =>
        draft
          ? [
              draft.placementHold,
              placementFromText(draft.text).status !== 'confirmed'
                ? { text: draft.text }
                : undefined,
            ]
          : [],
      ),
    ].filter((hold): hold is { text: string } => !!hold);
    const isPreparation = (hold: { text: string }) => {
      const evidence = placementFromText(hold.text);
      return evidence.status === 'preparation' || evidence.basis === 'conflicting';
    };
    const placementHold = holds.find(isPreparation) ?? holds[0];
    if (confirmation && placementHold && isPreparation(placementHold))
      throw new Error(
        'Esta imagen también contiene evidencia previa de preparación. Añade un comprobante diferente.',
      );
    const draftJson = JSON.stringify({
      ...parsed,
      placement,
      placementHold,
      humanReviewed: !!confirmation,
    });
    const needsReview = async (reason: string) => {
      if (confirmation) throw new Error(reason);
      return d.uploads.update(uploadId, { status: 'review', draftJson, reason, progress: 100 });
    };
    // A visible GLOBAL settled ticket is not an unsettled wager. Route it
    // to review even if OCR identified an already placed ticket: the normal
    // registration path would otherwise create a pending stake movement.
    // Never trust cached visibleStatus alone; inspect the raw ticket header.
    const settledHeader = parsed.house === 'Betano'
      ? parsed.text.split(/\r?\n/).map((line) => settledTicketHeader(line)).find(Boolean)
      : undefined;
    if (settledHeader)
      return needsReview(
        `El boleto ya muestra estado global ${settledHeader}. No lo registramos como apuesta pendiente ni generamos movimientos automáticos: revisa su liquidación por separado.`,
      );

    if (
      !parsed.house ||
      parsed.stake === undefined ||
      parsed.odds === undefined ||
      parsed.potential === undefined ||
      !parsed.kind
    )
      return needsReview(
        'Faltan casa, monto, cuota o retorno. Sube el boleto completo o una imagen más nítida.',
      );
    if (parsed.expectedSelections && parsed.expectedSelections !== parsed.selections.length)
      return needsReview(
        `Se reconocieron ${parsed.selections.length} de ${parsed.expectedSelections} selecciones. Necesitamos la captura completa.`,
      );
    const placementReason = placementReviewReason(placement);
    if (placementReason) return needsReview(placementReason);
    if (placementHold && !confirmation)
      return needsReview(
        'La misma imagen ya requería comprobar su colocación. Releer no la confirma: añade un comprobante o revisa explícitamente la evidencia recuperada.',
      );
    // New OCR drafts can retain ambiguous raw labels/null odds without turning
    // them into confirmed bets. Older drafts remain schema-compatible.
    if (!confirmation && parsed.reviewReasons?.length)
      return needsReview(parsed.reviewReasons.join(' '));
    // Re-evaluate the raw evidence at the write boundary: persisted drafts may
    // predate semantic metadata, and cached confidence is not authorization.
    const semanticReasons = semanticReviewReasons(interpretSelections(parsed.selections));
    if (!confirmation && semanticReasons.length) return needsReview(semanticReasons.join(' '));
    const missingOdds = parsed.selections.findIndex((s) => s.odds === null);
    if (missingOdds >= 0)
      return needsReview(
        `Selección ${missingOdds + 1}: cuota ausente. Conservamos todos los datos para revisión.`,
      );
    const betId = upload.id;
    const rows = parsed.selections.map((s) => ({ ...s, id: id(), betId }));
    const invalidRow = rows.findIndex((s) => !selectionSchema.safeParse(s).success);
    if (!rows.length || invalidRow >= 0)
      return needsReview(
        !rows.length
          ? 'No pudimos separar los partidos del boleto. Conservamos la captura para volver a leerla.'
          : `Selección ${invalidRow + 1}: ${!rows[invalidRow].event ? 'no pudimos separar los equipos' : !rows[invalidRow].market ? 'mercado no reconocido' : 'no pudimos separar todos los mercados internos'}. Conservamos la captura; puedes usar Mejorar lectura.`,
      );
    // OCR only prepares a draft. Even a complete read needs a deliberate,
    // current preview confirmation before master data or financial writes.
    if (!confirmation)
      return needsReview('Lectura lista. Coteja la captura y confirma el registro de esta apuesta.');
    const houses = await d.houses.toArray();
    let house = houses.find((h) => h.name.toLowerCase() === parsed.house!.toLowerCase());
    if (house && house.currency !== 'PEN')
      return needsReview(
        'La billetera de esta casa usa otra moneda. No mezclamos este boleto PEN con su saldo.',
      );
    if (!house) {
      const houseId = id();
      await scopedRepository.saveMaster('houses', {
        id: houseId,
        name: parsed.house,
        active: true,
        currency: 'PEN',
        platform: '',
        channel: '',
        url: '',
        notes: 'Creada al leer una captura',
      });
      house = await d.houses.get(houseId);
    }
    const raw = {
      id: betId,
      date: upload.createdAt,
      dateSource: 'upload',
      timingUnknown: true,
      houseId: house!.id,
      streamerId: '',
      kind: parsed.kind,
      live: false,
      stake: parsed.stake,
      odds: parsed.odds,
      potential: parsed.potential,
      bonus:
        parsed.bonusAmount !== undefined
          ? { amount: parsed.bonusAmount, treatment: 'Sin confirmar' }
          : undefined,
      notes: parsed.warnings.join('\n'),
      source: 'ocr',
      imageId: image.id,
      fingerprint: '',
      createdAt: upload.createdAt,
      updatedAt: timestamp(),
    };
    const checked = betSchema.safeParse(raw);
    if (!checked.success)
      return needsReview(
        'Uno de los importes o el tipo de apuesta no es válido. Vuelve a subir el original.',
      );
    const bet: Bet = checked.data;
    const auditReview = async (decision: string) => {
      if (confirmation)
        await d.audit.add({
          id: id(),
          date: timestamp(),
          action: 'Revisión humana de captura',
          entityId: upload.id,
          before: upload.draftJson,
          after: JSON.stringify({
            decision,
            imageId: upload.imageId,
            selections: rows,
            stake: bet.stake,
            odds: bet.odds,
            potential: bet.potential,
            initialStatus: 'Pendiente',
            acknowledged: true,
            interpretation:
              'Texto cotejado por el usuario; atributos no reconocidos no se infieren',
            originalText: parsed.text,
          }),
        });
    };
    bet.fingerprint = fingerprint(bet, rows);
    {
      const allSelections = await d.selections.toArray();
      const semantic = fingerprint({ ...bet, date: '2000-01-01T12:00:00.000Z' }, rows);
      const imageIds = (await d.images.where('hash').equals(image.hash).toArray()).map((i) => i.id);
      const existing = (await d.bets.toArray()).find(
        (b) =>
          b.id !== betId &&
          ((b.imageId && imageIds.includes(b.imageId)) ||
            b.fingerprint === bet.fingerprint ||
            fingerprint(
              { ...b, date: '2000-01-01T12:00:00.000Z' },
              allSelections.filter((s) => s.betId === b.id),
            ) === semantic),
      );
      if (existing) {
        await d.uploads.update(uploadId, {
          status: 'duplicate',
          draftJson,
          reason:
            'Coincide con una apuesta registrada. Compara las capturas y vincula el mismo boleto sin duplicar el importe.',
          betId: existing.id,
          progress: 100,
        });
        if (confirmation) await auditReview('duplicate');
        return;
      }
    }
    await scopedRepository.saveBet(bet, rows, undefined, true);
    if (confirmation) await auditReview('saved');
    await d.uploads.update(uploadId, {
      status: 'saved',
      draftJson,
      reason: '',
      betId,
      progress: 100,
    });
  });
}

export async function linkCapture(uploadId: string, repository = repo) {
  const d = repository.database;
  await transact(d, 'rw', [d.uploads, d.bets, d.images, d.audit], async (d) => {
    const upload = await d.uploads.get(uploadId);
    if (upload?.status === 'linked') return;
    if (
      !upload ||
      upload.status !== 'duplicate' ||
      !upload.betId ||
      !(await d.bets.get(upload.betId)) ||
      !(await d.images.get(upload.imageId))
    )
      throw new Error('La coincidencia ya no está disponible. Vuelve a leer la captura.');
    await d.uploads.update(uploadId, {
      status: 'linked',
      reason: 'Actualización vinculada. El stake y los cobros no se modificaron.',
    });
    await d.audit.add({
      id: id(),
      date: timestamp(),
      action: 'Vincular actualización de boleto',
      entityId: upload.betId,
      before: JSON.stringify(upload),
      after: JSON.stringify({ ...upload, status: 'linked' }),
    });
  });
}

export async function retryFailedCaptures(repository = repo) {
  const d = repository.database;
  return transact(d, 'rw', d.uploads, (d) =>
    d.uploads.where('status').anyOf('error', 'review').modify({
      status: 'queued',
      progress: 0,
      reason: '',
      enhanced: true,
      allowDuplicate: false,
      betId: undefined,
    }),
  );
}

export function startCaptureQueue() {
  let disposed = false;
  const sessions = Array.from({ length: ocrConcurrency() }, () => createOcrSession());
  const running = sessions.map(() => false);
  const generation = cloudStore.generation;
  const active = () => !disposed && cloudStore.generation === generation;
  const drain = async (session: ReturnType<typeof createOcrSession>, lane: number) => {
    if (!active() || running[lane] || !navigator.onLine) return;
    running[lane] = true;
    try {
      const expired = () =>
        repo.database.uploads.filter(
          (u) => u.status === 'processing' && (!u.leaseUntil || u.leaseUntil < timestamp()),
        );
      // Do not create a write transaction or trigger a full UI refresh every
      // five seconds when the queue is empty.
      if (lane === 0 && (await expired().count())) {
        await transact(repo.database, 'rw', repo.database.uploads, async (d) => {
          await d.uploads
            .filter(
              (u) => u.status === 'processing' && (!u.leaseUntil || u.leaseUntil < timestamp()),
            )
            .modify({ status: 'queued' });
        });
      }
      while (active()) {
        const job = (
          await repo.database.uploads.where('status').equals('queued').sortBy('createdAt')
        )[0];
        if (!job) break;
        // Account version compare-and-swap makes this claim exclusive across devices.
        const claimed = await transact(repo.database, 'rw', repo.database.uploads, async (d) => {
          const current = await d.uploads.get(job.id);
          if (current?.status !== 'queued') return false;
          await d.uploads.update(job.id, {
            status: 'processing',
            progress: 0,
            reason: '',
            leaseUntil: new Date(Date.now() + 10 * 60000).toISOString(),
          });
          return true;
        });
        if (!claimed) continue;
        try {
          const im = await repo.database.images.get(job.imageId);
          if (!im) throw new Error('Captura no disponible');
          captureActivity(job.id, { phase: 'reading', progress: 0 });
          const parsed = await session.run((reader) =>
            readCapture(
              reader,
              im.blob,
              (progress) => {
                if (active()) captureActivity(job.id, { phase: 'reading', progress });
              },
              job.enhanced,
            ),
          );
          if (!active()) break;
          captureActivity(job.id, { phase: 'saving', progress: 100 });
          await registerCapture(job.id, parsed);
        } catch (error) {
          if (!active()) break;
          await transact(repo.database, 'rw', repo.database.uploads, async (d) => {
            const current = await d.uploads.get(job.id);
            if (current?.status === 'processing')
              await d.uploads.update(job.id, {
                status: 'error',
                reason: error instanceof Error ? error.message : String(error),
              });
          });
        } finally {
          captureActivity(job.id);
        }
      }
    } catch {
      /* Network/conflict: next cycle reads the confirmed cloud state. */
    } finally {
      running[lane] = false;
    }
  };
  const kick = () =>
    sessions.forEach((session, lane) => {
      void drain(session, lane);
    });
  const unsubscribe = cloudStore.subscribe(kick);
  const timer = setInterval(kick, 5000);
  kick();
  return () => {
    disposed = true;
    unsubscribe();
    clearInterval(timer);
    sessions.forEach((session) => session.dispose());
  };
}
