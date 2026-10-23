import { z } from 'zod';
import { selectionSchema, promotions, type CaptureUpload } from '../domain/model';
import { placementFromText, type ParsedTicket } from './parser';
import { interpretSelections, semanticReviewReasons } from './semanticReview';

export const reviewSelectionSchema = selectionSchema.omit({ id: true, betId: true, order: true });
// A draft can be incomplete; final financial writes still use selectionSchema.
const draftLabel = z.string().max(5000).default('');
const draftSelection = z.object({
  event: draftLabel,
  market: draftLabel,
  pick: draftLabel,
  sport: z.string().max(5000).default(''),
  league: z.string().max(5000).default(''),
  odds: z.number().nullable().default(null),
  promotion: z.enum(promotions).optional(),
  builderMarkets: z
    .array(
      z.object({ market: draftLabel, pick: draftLabel, promotion: z.enum(promotions).optional() }),
    )
    .max(100)
    .optional(),
});
const historySchema = z.object({
  text: z.string().max(2000000),
  placementHold: z.object({ text: z.string().max(2000000) }).optional(),
});
// Placement evidence must survive even when the rest of an older draft is invalid.
export function readPlacementHistory(json: string) {
  try {
    const r = historySchema.safeParse(JSON.parse(json));
    return r.success ? r.data : undefined;
  } catch {
    return undefined;
  }
}
const draftSchema = z
  .object({
    text: z.string().max(500000),
    house: z.string().max(100).optional(),
    kind: z.string().optional(),
    stake: z.number().optional(),
    odds: z.number().optional(),
    potential: z.number().optional(),
    cashoutOffer: z.number().optional(),
    expectedSelections: z.number().optional(),
    bonusAmount: z.number().optional(),
    selections: z.array(draftSelection).max(100),
    warnings: z.array(z.string()).default([]),
    confidence: z.record(z.string(), z.enum(['high', 'review', 'missing'])).default({}),
    reviewReasons: z.array(z.string()).optional(),
    placementHold: z.object({ text: z.string().max(500000) }).optional(),
  })
  .passthrough();
export type ReviewDraft = ParsedTicket & {
  placementHold?: { text: string };
  humanReviewed?: boolean;
};
export function readDraft(json: string): ReviewDraft | undefined {
  try {
    const result = draftSchema.safeParse(JSON.parse(json));
    if (!result.success) return undefined;
    return {
      ...result.data,
      selections: result.data.selections.map((s) => ({
        ...s,
        event: s.event ?? '',
        market: s.market ?? '',
        pick: s.pick ?? '',
      })),
    } as ReviewDraft;
  } catch {
    return undefined;
  }
}
export function needsNewProof(draft: ReviewDraft) {
  const hold = draft.placementHold && placementFromText(draft.placementHold.text);
  return (
    placementFromText(draft.text).status !== 'confirmed' ||
    !!(hold && (hold.status === 'preparation' || hold.basis === 'conflicting'))
  );
}
export function reviewIssues(upload: CaptureUpload, draft = readDraft(upload.draftJson)) {
  if (upload.status === 'duplicate')
    return [
      {
        kind: 'duplicate',
        title: 'Posible duplicado',
        detail: 'Compara las capturas antes de vincularlas o registrar otra operación.',
      },
    ];
  if (!draft)
    return [
      {
        kind: 'incomplete',
        title: 'Lectura incompleta',
        detail: 'No hay un borrador legible. Prueba otra lectura o una captura más nítida.',
      },
    ];
  const issues: { kind: string; title: string; detail: string }[] = [];
  if (needsNewProof(draft))
    issues.push({
      kind: 'placement',
      title: 'Falta comprobante de colocación',
      detail:
        'Añade una captura de la apuesta aceptada. Releer esta imagen no confirma que se haya colocado.',
    });
  else if (draft.placementHold)
    issues.push({
      kind: 'placement-review',
      title: 'Confirma la evidencia recuperada',
      detail:
        'La primera lectura no acreditó colocación. Revisa el comprobante antes de registrar.',
    });
  if (
    !draft.house ||
    !draft.kind ||
    draft.stake === undefined ||
    draft.odds === undefined ||
    draft.potential === undefined ||
    !draft.selections.length ||
    (draft.expectedSelections && draft.expectedSelections !== draft.selections.length) ||
    draft.selections.some((s) => !s.event || !s.market || !s.pick)
  )
    issues.push({
      kind: 'incomplete',
      title: 'Datos OCR incompletos',
      detail:
        'Revisa casa, importes y número de partidos. La información ausente no se calcula ni se inventa.',
    });
  const absent = draft.selections.flatMap((s, i) => (s.odds == null ? [i + 1] : []));
  if (absent.length)
    issues.push({
      kind: 'odds',
      title: 'Cuota ausente',
      detail: `Partidos ${absent.join(', ')}. Puedes transcribir la cuota visible al revisar datos.`,
    });
  if (
    semanticReviewReasons(interpretSelections(draft.selections)).length ||
    draft.reviewReasons?.some((r) => !r.includes('cuota ausente'))
  )
    issues.push({
      kind: 'semantic',
      title: 'Mercado o participante por verificar',
      detail:
        'Coteja cada etiqueta y participante con la captura. Conservaremos el texto que confirmes sin atribuir significados nuevos.',
    });
  return issues.length
    ? issues
    : [
        {
          kind: 'review',
          title: 'Revisión de datos',
          detail: upload.reason || 'Comprueba los datos antes de registrar.',
        },
      ];
}
