import type { CaptureUpload, Snapshot } from '../domain/model';
import {
  sameCaptureIdentity,
  type CaptureTerms,
  type CaptureRows,
} from '../domain/captureDuplicates';
import { historicalTimingSchema, limaDay } from '../domain/model';
import { selectionProduct } from '../domain/odds';
import { readDraft, canReviewCapture, reviewSelectionSchema, type ReviewDraft } from './review';
import { interpretSelections, semanticReviewReasons } from './semanticReview';
import { settlementEvidence, validateHistoricalImport, type HistoricalImport } from './settlement';
import { captureMode } from './visualMode';

// Match minutes (66:14, 70:00) and scoreboard clocks are never calendar evidence.
export function captureTiming(draft: ReviewDraft, upload: CaptureUpload, recordedAt: string) {
  const evidence = settlementEvidence(draft);
  const relative = /\b(hoy|mañana|esta noche|esta tarde|esta mañana)\s+(\d{1,2}):(\d{2})\b/gi;
  const calendar = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})\b/g;
  const events: ReturnType<typeof historicalTimingSchema.parse>['events'] = [];
  const lines = draft.text.split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    // Schedule labels belong to events, never to a bet/settlement instant.
    const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const context = clean(lines.slice(Math.max(0, lineIndex - 1), lineIndex + 2).join(' '));
    const matches = draft.selections.flatMap((s, i) => {
      const teams = s.event.split(/\s+vs?\.?\s+/i).map(clean);
      return teams.length === 2 && teams.every((t) => t.length > 2 && context.includes(t))
        ? [i]
        : [];
    });
    // An omitted schedule must never shift all later dates onto the wrong legs.
    const selection = matches.length === 1 ? matches[0] : null;
    for (const m of line.matchAll(relative)) {
      if (+m[2] > 23 || +m[3] > 59) continue;
      const day = new Date(limaDay(upload.createdAt) + 'T12:00:00Z');
      if (m[1].toLowerCase() === 'mañana') day.setUTCDate(day.getUTCDate() + 1);
      const at = new Date(
        `${day.toISOString().slice(0, 10)}T${m[2].padStart(2, '0')}:${m[3]}:00-05:00`,
      ).toISOString();
      events.push({ selection, label: m[0], at, relative: true, basis: 'upload-reference' });
    }
    for (const m of line.matchAll(calendar)) {
      const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:00-05:00`;
      const result = historicalTimingSchema.shape.recordedAt.safeParse(
        new Date(iso).toString() === 'Invalid Date' ? '' : new Date(iso).toISOString(),
      );
      // Reject normalization of impossible dates (e.g. February 31).
      if (
        result.success &&
        new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) === iso.slice(0, 10)
      )
        events.push({
          selection,
          label: m[0],
          at: result.data,
          relative: false,
          basis: 'ticket-calendar',
        });
    }
  }
  return historicalTimingSchema.parse({
    recordedAt,
    uploadedAt: upload.createdAt,
    betAt: evidence.betDate ?? null,
    settledAt: evidence.settlementDate ?? null,
    mode: captureMode(draft),
    events,
  });
}

export function prepareAutomaticImport(upload: CaptureUpload, recordedAt: string) {
  const draft = readDraft(upload.draftJson);
  const reasons: string[] = [];
  if (!draft) return { reasons: ['Lectura incompleta.'] };
  const evidence = settlementEvidence(draft);
  if (!evidence.kind || evidence.manualState)
    reasons.push(
      evidence.candidate
        ? 'Estado global ambiguo.'
        : draft.houseBasis === 'superaumento-product-layout'
          ? 'Superaumento leído: falta acreditar el estado global y el cobro. Los checks de cada mercado no liquidan el boleto completo.'
          : 'Boleto abierto: ninguna oferta es un cobro.',
    );
  if (!canReviewCapture(draft)) reasons.push('Falta evidencia de colocación.');
  if (evidence.partial) reasons.push('Cierre parcial o stake cerrado ambiguo.');
  if (evidence.conflictingAmounts) reasons.push('Cobros contradictorios.');
  if (
    !['Betano', 'Bet365'].includes(draft.house ?? '') ||
    !['Simple', 'Combinada'].includes(draft.kind ?? '') ||
    !draft.stake
  )
    reasons.push('Casa, tipo o stake no reconocidos.');
  if (
    !draft.selections.length ||
    (draft.expectedSelections && draft.expectedSelections !== draft.selections.length)
  )
    reasons.push('Faltan selecciones.');
  if (draft.selections.some((s) => s.odds === null || !reviewSelectionSchema.safeParse(s).success))
    reasons.push('Selección, mercado, jugador o cuota incompletos.');
  reasons.push(...semanticReviewReasons(interpretSelections(draft.selections)));
  const returned = evidence.returned ?? evidence.receiptReturn;
  if (returned === undefined) reasons.push('El importe cobrado no se lee con certeza.');
  if (reasons.length) return { draft, evidence, reasons };
  const product =
    draft.odds === undefined && draft.kind === 'Combinada'
      ? selectionProduct(draft.selections)
      : undefined;
  try {
    const historical: HistoricalImport = validateHistoricalImport(
      {
        kind: evidence.kind,
        returned,
        closedStake: draft.stake,
        betDate: recordedAt,
        settlementDate: recordedAt,
        fullClosureConfirmed: true,
        automatic: true,
        timing: captureTiming(draft, upload, recordedAt),
        header: {
          house: draft.house,
          kind: draft.kind,
          stake: draft.stake,
          odds: draft.odds ?? product?.odds ?? null,
          potential: draft.potential ?? null,
          oddsSource: product
            ? 'selection-product'
            : draft.odds === undefined
              ? undefined
              : 'ticket',
          oddsCalculation: product ? { method: product.method, inputs: product.inputs } : undefined,
        },
      },
      draft,
      draft.selections,
    );
    return { draft, evidence, historical, reasons };
  } catch (e) {
    return {
      draft,
      evidence,
      reasons: [e instanceof Error ? e.message : 'Datos contradictorios.'],
    };
  }
}

export function previewAutomaticBatch(
  uploads: CaptureUpload[],
  recordedAt: string,
  snapshot: Snapshot,
  excluded: string[],
) {
  type Row = {
    upload: CaptureUpload;
    historical?: HistoricalImport;
    draft?: ReviewDraft;
    evidence?: ReturnType<typeof settlementEvidence>;
    reasons: string[];
    duplicateOf?: string;
    expectedOutcome?: 'saved' | 'duplicate';
  };
  const rows: Row[] = uploads
    .filter((u) => ['review', 'error'].includes(u.status))
    .map((upload) => ({ upload, ...prepareAutomaticImport(upload, recordedAt) }));
  const seen: { id: string; terms: CaptureTerms; selections: CaptureRows; imageId?: string }[] =
    snapshot.bets.map((bet) => ({
      id: bet.id,
      terms: bet,
      selections: snapshot.selections.filter((s) => s.betId === bet.id),
      imageId: bet.imageId,
    }));
  const ready: Row[] = [];
  for (const row of rows) {
    const h = row.historical;
    if (!h || excluded.includes(row.upload.id) || ready.length >= 25) continue;
    const house = snapshot.houses.find(
      (m) => m.name.toLowerCase() === h.header.house.toLowerCase(),
    );
    if (house && house.currency !== 'PEN') {
      row.reasons.push('La billetera usa otra moneda.');
      row.historical = undefined;
      continue;
    }
    const terms = {
      houseId: house?.id ?? `house:${h.header.house.toLowerCase()}`,
      date: h.betDate,
      stake: h.header.stake,
      odds: h.header.odds,
      ticketReference: row.draft!.ticketReference,
    };
    const match = seen.find(
      (b) =>
        b.imageId === row.upload.imageId ||
        sameCaptureIdentity(terms, row.draft!.selections, b.terms, b.selections),
    );
    row.duplicateOf = match?.id;
    row.expectedOutcome = match ? 'duplicate' : 'saved';
    if (!match)
      seen.push({
        id: row.upload.id,
        terms,
        selections: row.draft!.selections,
        imageId: row.upload.imageId,
      });
    ready.push(row);
  }
  return { rows, ready };
}
