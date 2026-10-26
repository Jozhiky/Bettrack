import { transact } from './cloudStore';
import { cloudStore, CloudStore } from './cloudStore';
import { retryCaptureConflict } from './captureRetry';
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
import { prepareAutomaticImport } from '../ocr/automaticImport';
import type { BettrackDB } from './db';
import { sameCaptureTerms, sameCaptureIdentity } from '../domain/captureDuplicates';
import { betPlacementMode } from '../ocr/visualMode';
import { automaticCapturePolicy } from './automaticCapturePolicy';
import { verifyAutomaticEvidence, automaticTerms } from '../ocr/automaticEvidence';
import { prepareAutomaticPending } from '../ocr/automaticPending';
import type { AutomaticPolicy } from '../domain/automaticPolicy';
import {
  readDraft,
  readPlacementHistory,
  canReviewCapture,
  reviewSelectionSchema,
  type ReviewDraft,
} from '../ocr/review';
import { id, timestamp, fingerprint, betSchema, selectionSchema, type Bet } from '../domain/model';
import {
  settlementEvidence,
  validateHistoricalImport,
  type HistoricalImport,
} from '../ocr/settlement';

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
      await retryCaptureConflict(() =>
        transact(d, 'rw', [d.uploads, d.images, d.bets, d.audit], async (d) => {
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
            reason: existing
              ? 'Esta imagen ya está registrada. No se ha vuelto a ejecutar OCR.'
              : '',
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
        }),
      );
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
  const d = repository.database;
  // Preserve OCR independently of the financial unit of work. If that unit
  // fails, the original image and complete draft remain available for retry.
  await retryCaptureConflict(() =>
    transact(d, 'rw', d.tables, async (scope) => {
      const scoped = new LocalRepository(scope);
      await processCapture(uploadId, parsed, scoped, undefined, true);
      const prepared = await scope.uploads.get(uploadId);
      if (
        prepared?.status === 'review' &&
        (await automaticCapturePolicy(scoped, prepared.createdAt))
      )
        await scope.uploads.update(uploadId, { status: 'processing' });
    }),
  );
  const current = await d.uploads.get(uploadId);
  if (!current || !['processing', 'review'].includes(current.status)) return;
  const bookingAt =
    d instanceof CloudStore &&
    current &&
    (await automaticCapturePolicy(repository, current.createdAt))
      ? await d.captureBookingTime()
      : undefined;
  return retryCaptureConflict(() =>
    transact(d, 'rw', d.tables, async (scope) => {
      const scoped = new LocalRepository(scope);
      const u = await scope.uploads.get(uploadId);
      if (u?.status === 'processing') {
        await scope.uploads.update(uploadId, { status: 'review' });
        u.status = 'review';
      }
      if (!u || u.status !== 'review') return;
      const policy = await automaticCapturePolicy(scoped, u.createdAt);
      if (!policy) return;
      const draft = readDraft(u.draftJson),
        image = await scope.images.where('id').equals(u.imageId).first();
      if (!draft || !image || !(await verifyAutomaticEvidence(draft, image.hash))) {
        await scope.uploads.update(uploadId, {
          reason: 'Lecturas OCR sin acuerdo suficiente. Captura conservada sin cargos.',
        });
        return;
      }
      const at = bookingAt ?? timestamp(),
        historical = prepareAutomaticImport(u, at),
        pending = prepareAutomaticPending(u);
      const reasons = historical.evidence?.candidate ? historical.reasons : pending.reasons;
      if (draft.reviewReasons?.length || reasons.length) {
        await scope.uploads.update(uploadId, {
          reason: [...new Set([...(draft.reviewReasons ?? []), ...reasons])].join(' '),
        });
        return;
      }
      const house = (await scope.houses.toArray()).find(
        (h) => h.name.toLowerCase() === draft.house!.toLowerCase(),
      );
      if (house && house.currency !== 'PEN') {
        await scope.uploads.update(uploadId, {
          reason:
            'La billetera de esta casa usa otra moneda. No mezclamos este boleto PEN con su saldo.',
        });
        return;
      }
      const related =
        draft.ticketReference && house
          ? (await scope.bets.toArray()).filter(
              (b) => b.houseId === house.id && b.ticketReference === draft.ticketReference,
            )
          : [];
      if (related.length > 1) {
        await scope.uploads.update(uploadId, {
          reason: 'La referencia identifica más de un registro. Se conserva sin movimientos.',
        });
        return;
      }
      if (related.length === 1) {
        const existing = related[0],
          rows = await scope.selections.where('betId').equals(existing.id).toArray();
        if (
          automaticTerms({
            ...draft,
            selections: [...rows]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((s) => ({
                ...s,
                promotion: s.promotion || undefined,
                builderMarkets: s.builderMarkets?.map((m) => ({
                  ...m,
                  promotion: m.promotion || undefined,
                })),
              })),
          }) !== automaticTerms(draft) ||
          !sameCaptureTerms(
            existing,
            rows,
            { houseId: house!.id, stake: draft.stake!, odds: draft.odds ?? null, date: at },
            draft.selections,
          )
        ) {
          await scope.uploads.update(uploadId, {
            reason:
              'La referencia coincide, pero los importes o selecciones difieren. No se cambia la apuesta.',
          });
          return;
        }
        const settlements = await scope.settlements.where('betId').equals(existing.id).toArray(),
          h = historical.historical;
        if (
          h &&
          settlements.length &&
          !settlements.every(
            (s) =>
              s.kind === h.kind && s.returned === h.returned && s.closedStake === h.closedStake,
          )
        ) {
          await scope.uploads.update(uploadId, {
            reason: 'El resultado contradice una liquidación ya guardada. No se reescribe.',
          });
          return;
        }
        if (h && Date.parse(existing.date) > Date.parse(h.settlementDate)) {
          await scope.uploads.update(uploadId, {
            reason:
              'La fecha del registro existente contradice la liquidación. Se conserva sin movimientos.',
          });
          return;
        }
        if (h && !settlements.length)
          await scoped.settle({
            id: `settlement-${existing.id}`,
            betId: existing.id,
            date: h.settlementDate,
            kind: h.kind,
            closedStake: h.closedStake,
            returned: h.returned,
            note: 'Resultado leído automáticamente. Fecha de registro contable; fechas históricas conservadas en la captura.',
          });
        await scope.uploads.update(uploadId, {
          status: h ? 'linked' : 'duplicate',
          betId: existing.id,
          reason: h
            ? 'Resultado aplicado a la apuesta existente, sin un nuevo cargo de stake.'
            : 'La referencia ya está registrada. Sin cargo nuevo.',
          progress: 100,
        });
        await scope.audit.add({
          id: id(),
          date: timestamp(),
          action: 'Registro automático de captura',
          entityId: uploadId,
          before: u.draftJson,
          after: JSON.stringify({
            standingConsent: policy,
            imageId: u.imageId,
            betId: existing.id,
            decision: h && !settlements.length ? 'settle-existing' : 'duplicate',
            historical: h,
            acknowledged: false,
          }),
        });
        return;
      }
      // Terms alone can prevent a duplicate, but cannot authorize settlement of
      // an existing wager when the images do not contain a common reference.
      if (historical.historical && house) {
        const allRows = await scope.selections.toArray();
        const possible = (await scope.bets.toArray()).find((b) =>
          sameCaptureIdentity(
            b,
            allRows.filter((s) => s.betId === b.id),
            {
              houseId: house.id,
              stake: draft.stake!,
              odds: draft.odds ?? null,
              date: at,
              ticketReference: draft.ticketReference,
            },
            draft.selections,
          ),
        );
        if (possible) {
          await scope.uploads.update(uploadId, {
            status: 'duplicate',
            betId: possible.id,
            reason:
              'Posible boleto existente sin referencia común acreditada. No se añade cargo ni se liquida automáticamente.',
          });
          return;
        }
      }
      await processCapture(
        uploadId,
        undefined,
        scoped,
        {
          expectedDraft: u.draftJson,
          imageId: u.imageId,
          selections: draft.selections,
          acknowledged: false,
          standingConsent: policy,
          ...(historical.historical ? { historical: historical.historical } : {}),
        },
        true,
      );
    }),
  );
}

export interface CaptureReviewConfirmation {
  expectedDraft: string;
  imageId: string;
  selections: ParsedTicket['selections'];
  acknowledged: boolean;
  historical?: HistoricalImport;
  standingConsent?: AutomaticPolicy;
}
export async function confirmCaptureReview(
  uploadId: string,
  confirmation: CaptureReviewConfirmation,
  repository = repo,
) {
  return processCapture(uploadId, undefined, repository, confirmation);
}
export interface AutomaticBatchItem {
  uploadId: string;
  confirmation: CaptureReviewConfirmation;
  expectedOutcome: 'saved' | 'duplicate';
}
// One account transaction, one exact summary and one explicit consent. No per-ticket form.
export async function confirmAutomaticBatch(
  items: AutomaticBatchItem[],
  consent: boolean,
  repository = repo,
) {
  if (!consent) throw Error('Confirma el resumen del lote antes de registrar.');
  if (
    !items.length ||
    items.length > 25 ||
    new Set(items.map((i) => i.uploadId)).size !== items.length
  )
    throw Error('El lote debe contener entre 1 y 25 capturas distintas.');
  return transact(repository.database, 'rw', repository.database.tables, async (d) => {
    const scoped = new LocalRepository(d);
    let fresh = false;
    for (const item of items) {
      if (!item.confirmation.historical?.automatic)
        throw Error('El lote no coincide con su preparación automática.');
      const u = await d.uploads.get(item.uploadId);
      fresh ||= !!u && ['review', 'error'].includes(u.status);
      if (u?.status === 'error' && u.draftJson === item.confirmation.expectedDraft)
        await d.uploads.update(u.id, { status: 'review' });
      await processCapture(item.uploadId, undefined, scoped, item.confirmation, true);
      if ((await d.uploads.get(item.uploadId))?.status !== item.expectedOutcome)
        throw Error('Los duplicados del lote cambiaron. Actualiza el resumen antes de confirmar.');
    }
    const uploads = await Promise.all(items.map((i) => d.uploads.get(i.uploadId)));
    if (fresh)
      await d.audit.add({
        id: id(),
        date: timestamp(),
        action: 'Confirmar lote histórico',
        entityId: items[0].uploadId,
        before: JSON.stringify({ financialConsent: false }),
        after: JSON.stringify({
          financialConsent: true,
          scope: 'exact-batch-summary',
          items: items.map((item, i) => ({
            uploadId: item.uploadId,
            imageId: item.confirmation.imageId,
            historical: item.confirmation.historical,
            outcome: uploads[i]?.status,
          })),
        }),
      });
    return {
      saved: uploads.filter((u) => u?.status === 'saved').length,
      duplicates: uploads.filter((u) => u?.status === 'duplicate').length,
    };
  });
}
export async function reopenHistoricalCapture(uploadId: string, repository = repo) {
  const d = repository.database;
  await transact(d, 'rw', [d.uploads, d.audit], async (d) => {
    const before = await d.uploads.get(uploadId),
      draft = before && readDraft(before.draftJson);
    if (
      !before ||
      !['review', 'error'].includes(before.status) ||
      !draft ||
      !settlementEvidence(draft).candidate
    )
      throw Error('No hay un borrador histórico recuperable.');
    if (before.status === 'review') return;
    await d.uploads.update(uploadId, { status: 'review' });
    await d.audit.add({
      id: id(),
      date: timestamp(),
      action: 'Reabrir borrador histórico',
      entityId: uploadId,
      before: JSON.stringify({ status: before.status }),
      after: JSON.stringify({ status: 'review', imageId: before.imageId }),
    });
  });
}

async function processCapture(
  uploadId: string,
  input: ParsedTicket | undefined,
  repository: LocalRepository,
  confirmation?: CaptureReviewConfirmation,
  inTransaction = false,
) {
  const d = repository.database;
  const apply = async (d: BettrackDB) => {
    const scopedRepository = new LocalRepository(d);
    const upload = await d.uploads.get(uploadId);
    if (confirmation?.historical && upload && ['saved', 'duplicate'].includes(upload.status)) {
      const reviewed = await d.audit
        .filter((a) => a.entityId === uploadId && a.action === 'Revisión humana de captura')
        .toArray();
      if (
        reviewed.some((a) => {
          try {
            return JSON.parse(a.after).confirmationJson === JSON.stringify(confirmation);
          } catch {
            return false;
          }
        })
      )
        return;
    }
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
    if (confirmation?.standingConsent) {
      const policy = await automaticCapturePolicy(scopedRepository, upload.createdAt);
      const image = await d.images.where('id').equals(upload.imageId).first();
      if (
        !policy ||
        JSON.stringify(policy) !== JSON.stringify(confirmation.standingConsent) ||
        !previous ||
        !image ||
        !(await verifyAutomaticEvidence(previous, image.hash)) ||
        previous.reviewReasons?.length
      )
        throw Error('La autorización o la lectura automática dejó de estar vigente.');
      if (!confirmation.historical && prepareAutomaticPending(upload).reasons.length)
        throw Error('La captura pendiente no tiene evidencia suficiente para registro automático.');
      if (JSON.stringify(previous.selections) !== JSON.stringify(confirmation.selections))
        throw Error('Las selecciones de la lectura automática cambiaron.');
    }
    const historical = confirmation?.historical
      ? validateHistoricalImport(
          confirmation.historical,
          previous ?? { text: '', house: undefined },
          confirmation.selections,
        )
      : undefined;
    if (historical?.automatic) {
      const prepared = prepareAutomaticImport(upload, historical.betDate);
      if (
        JSON.stringify(prepared.historical) !== JSON.stringify(historical) ||
        JSON.stringify(previous?.selections) !== JSON.stringify(confirmation!.selections)
      )
        throw Error('La evidencia del lote cambió. Actualiza el resumen.');
      if (Date.now() - Date.parse(historical.betDate) > 10 * 60 * 1000)
        throw Error('El resumen venció. Actualiza el lote antes de confirmar.');
    }
    let parsed: ReviewDraft;
    if (confirmation) {
      if (!confirmation.acknowledged && !confirmation.standingConsent)
        throw new Error('Confirma explícitamente que cotejaste los datos con la imagen.');
      if (!previous || !canReviewCapture(previous))
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
      if (await d.bets.get(uploadId))
        throw new Error('La apuesta ya existe. No se puede sobrescribir mediante una captura.');
      parsed = {
        ...previous,
        ...(historical
          ? {
              ...historical.header,
              odds: historical.header.odds ?? undefined,
              potential: historical.header.potential ?? undefined,
            }
          : {}),
        selections,
        humanReviewed: !historical?.automatic && !confirmation.standingConsent,
      };
    } else parsed = input!;
    // The original is already stored. Registration needs its metadata, not a
    // second Storage download of the pixels we have just recognized.
    const image = await d.images.where('id').equals(upload.imageId).first();
    if (!image) throw new Error('No se encuentra la captura original.');
    if (parsed.visualMode && parsed.visualMode.imageHash !== image.hash)
      throw Error('La evidencia visual no corresponde a esta imagen. Actualiza la lectura.');
    if (parsed.receiptOcr && parsed.receiptOcr.imageHash !== image.hash)
      throw Error('La lectura del cobro no corresponde a esta imagen. Actualiza la lectura.');
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
      humanReviewed: !!confirmation && !historical?.automatic && !confirmation.standingConsent,
      automaticallyPrepared: !!confirmation?.standingConsent || historical?.automatic,
    });
    const needsReview = async (reason: string) => {
      if (confirmation) throw new Error(reason);
      return d.uploads.update(uploadId, { status: 'review', draftJson, reason, progress: 100 });
    };
    // A visible GLOBAL settled ticket is not an unsettled wager. Route it
    // to review even if OCR identified an already placed ticket: the normal
    // registration path would otherwise create a pending stake movement.
    // Never trust cached visibleStatus alone; inspect the raw ticket header.
    const settledHeader =
      parsed.house === 'Betano'
        ? parsed.text
            .split(/\r?\n/)
            .map((line) => settledTicketHeader(line))
            .find(Boolean)
        : undefined;
    if (settledHeader && !historical)
      return needsReview(
        `El boleto ya muestra estado global ${settledHeader}. Revisa fechas, retorno realizado y selecciones para confirmar su importación histórica completa.`,
      );
    if (settlementEvidence(parsed).candidate && confirmation && !historical)
      throw new Error(
        'Esta captura requiere importar su liquidación, no registrarla como pendiente.',
      );

    if (
      !parsed.house ||
      parsed.stake === undefined ||
      (!historical && parsed.odds === undefined) ||
      (!historical && parsed.potential === undefined) ||
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
    if (placementReason && !historical) return needsReview(placementReason);
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
    // Manual mode requires a current preview confirmation. Automatic mode
    // reaches this boundary only with a verified account authorization.
    if (!confirmation)
      return needsReview(
        'Lectura lista. Coteja la captura y confirma el registro de esta apuesta.',
      );
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
      date: historical?.betDate ?? upload.createdAt,
      dateSource: historical?.timing
        ? 'accounting'
        : historical
          ? settlementEvidence(previous!).betDate === historical.betDate
            ? 'ticket'
            : 'manual'
          : 'upload',
      historicalTiming: historical?.timing,
      timingUnknown: historical?.timing
        ? historical.timing.mode === 'unknown'
        : betPlacementMode(parsed) === 'unknown' && !historical,
      houseId: house!.id,
      streamerId: '',
      kind: parsed.kind,
      live: historical?.timing
        ? historical.timing.mode === 'live'
        : betPlacementMode(parsed) === 'live',
      stake: parsed.stake,
      odds: historical ? historical.header.odds : parsed.odds,
      potential: historical ? historical.header.potential : parsed.potential,
      oddsSource: historical?.header.oddsSource,
      oddsCalculation: historical?.header.oddsCalculation,
      ...(historical ? { historical: true } : {}),
      bonus:
        parsed.bonusAmount !== undefined
          ? { amount: parsed.bonusAmount, treatment: 'Sin confirmar' }
          : undefined,
      notes: parsed.warnings.join('\n'),
      source: 'ocr',
      imageId: image.id,
      fingerprint: '',
      ticketReference: parsed.ticketReference,
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
          action: confirmation.standingConsent
            ? 'Registro automático de captura'
            : 'Revisión humana de captura',
          entityId: upload.id,
          before: upload.draftJson,
          after: JSON.stringify({
            decision,
            imageId: upload.imageId,
            selections: rows,
            stake: bet.stake,
            odds: bet.odds,
            potential: bet.potential,
            initialStatus: historical?.kind ?? 'Pendiente',
            historical,
            uploadDate: upload.createdAt,
            confirmationJson: historical ? JSON.stringify(confirmation) : undefined,
            acknowledged: confirmation.acknowledged,
            standingConsent: confirmation.standingConsent,
            interpretation: confirmation.standingConsent
              ? 'Registro automático: autorización previa por cuenta y concordancia OCR; sin confirmación por lote.'
              : historical?.automatic
                ? 'Preparación automática desde evidencia del boleto; consentimiento explícito al resumen del lote. Fechas contables separadas de las históricas.'
                : 'Texto cotejado por el usuario; atributos no reconocidos no se infieren',
            originalText: parsed.text,
          }),
        });
    };
    bet.fingerprint = fingerprint(bet, rows);
    {
      const allSelections = await d.selections.toArray();
      const imageIds = (await d.images.where('hash').equals(image.hash).toArray()).map((i) => i.id);
      const existing = (await d.bets.toArray()).find(
        (b) =>
          b.id !== betId &&
          ((b.imageId && imageIds.includes(b.imageId)) ||
            sameCaptureIdentity(
              b,
              allSelections.filter((s) => s.betId === b.id),
              bet,
              rows,
            )),
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
    await scopedRepository.saveBet(
      bet,
      rows,
      undefined,
      true,
      historical
        ? {
            id: `settlement-${betId}`,
            betId,
            date: historical.settlementDate,
            closedStake: historical.closedStake,
            returned: historical.returned,
            kind: historical.kind,
            note: 'Importación histórica revisada desde captura; importe realizado confirmado.',
          }
        : undefined,
    );
    if (confirmation) await auditReview('saved');
    await d.uploads.update(uploadId, {
      status: 'saved',
      draftJson,
      reason: '',
      betId,
      progress: 100,
    });
  };
  if (inTransaction) await apply(d);
  else await transact(d, 'rw', d.tables, apply);
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
        const claimed = await retryCaptureConflict(() =>
          transact(repo.database, 'rw', repo.database.uploads, async (d) => {
            const current = await d.uploads.get(job.id);
            if (current?.status !== 'queued') return false;
            await d.uploads.update(job.id, {
              status: 'processing',
              progress: 0,
              reason: '',
              leaseUntil: new Date(Date.now() + 10 * 60000).toISOString(),
            });
            return true;
          }),
        );
        if (!claimed) continue;
        try {
          const im = await repo.database.images.get(job.imageId);
          if (!im) throw new Error('Captura no disponible');
          captureActivity(job.id, { phase: 'reading', progress: 0 });
          const automaticPolicy = await automaticCapturePolicy(repo, job.createdAt);
          const parsed = await session.run((reader) =>
            readCapture(
              reader,
              im.blob,
              (progress) => {
                if (active()) captureActivity(job.id, { phase: 'reading', progress });
              },
              job.enhanced,
              !!automaticPolicy,
            ),
          );
          if (!active()) break;
          captureActivity(job.id, { phase: 'saving', progress: 100 });
          await registerCapture(job.id, parsed);
        } catch (error) {
          if (!active()) break;
          await retryCaptureConflict(() =>
            transact(repo.database, 'rw', repo.database.uploads, async (d) => {
              const current = await d.uploads.get(job.id);
              if (current && ['processing', 'review'].includes(current.status))
                await d.uploads.update(job.id, {
                  status: current.status === 'review' ? 'review' : 'error',
                  reason: error instanceof Error ? error.message : String(error),
                });
            }),
          );
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
