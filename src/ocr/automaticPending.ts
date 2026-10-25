import type { CaptureUpload } from '../domain/model';
import { readDraft, reviewSelectionSchema } from './review';
import { placementFromText } from './parser';
import { settlementEvidence } from './settlement';
import { interpretSelections, semanticReviewReasons } from './semanticReview';
export function prepareAutomaticPending(upload: CaptureUpload) {
  const draft = readDraft(upload.draftJson),
    reasons: string[] = [];
  if (!draft) return { reasons: ['Lectura incompleta.'] };
  if (settlementEvidence(draft).candidate)
    reasons.push('El boleto requiere liquidación histórica.');
  if (placementFromText(draft.text).status !== 'confirmed' || draft.placementHold)
    reasons.push('Falta acreditar la colocación sin retenciones previas.');
  if (
    !['Betano', 'Bet365'].includes(draft.house ?? '') ||
    !['Simple', 'Combinada'].includes(draft.kind ?? '') ||
    !draft.stake ||
    draft.odds === undefined ||
    draft.potential === undefined
  )
    reasons.push('Faltan importes o tipo de boleto.');
  if (
    !draft.selections.length ||
    (draft.expectedSelections && draft.expectedSelections !== draft.selections.length) ||
    draft.selections.some((s) => s.odds === null || !reviewSelectionSchema.safeParse(s).success)
  )
    reasons.push('Faltan selecciones, mercados o cuotas.');
  reasons.push(
    ...(draft.reviewReasons ?? []),
    ...semanticReviewReasons(interpretSelections(draft.selections)),
  );
  return { draft, reasons };
}
