import { z } from 'zod';
import type { ParsedTicket } from './parser';
import { placementFromDraft, placementFromText, parseTicket } from './parser';
import type { PlacementEvidence } from './placement';
import { settlementEvidence } from './settlement';
import { betPlacementMode, captureMode } from './visualMode';
import { verifiedSelectionResults } from './selectionResults';
import { interpretMarket } from './semantics';
export const automaticEvidenceSchema = z
  .object({
    version: z.literal('critical-fields-v1'),
    imageHash: z.string().regex(/^[a-f0-9]{64}$/),
    terms: z.string().min(1).max(100000),
    placementRead: z.string().max(4000).optional(),
  })
  .strict();
export type AutomaticEvidence = z.infer<typeof automaticEvidenceSchema>;
const text = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
// Agreement keys only: retain the original market/pick and every qualifier.
// The market's Más/Menos names two alternatives; only the numeric pick chooses
// over or under. Never fold accents in participants or use semantics alone as a key.
function selectionTerms(market: string, pick: string, event: string) {
  const m = text(market),
    p = text(pick),
    meaning = interpretMarket(market, pick, event);
  if (
    !['over', 'under'].includes(meaning.operator ?? '') ||
    !(
      meaning.scope === 'match' ||
      (meaning.scope === 'team' && meaning.confidence.participant === 'recognized')
    ) ||
    !/^(?:más|mas|menos) de \d+(?:[.,]\d+)?$/.test(p)
  )
    return { market: m, pick: p };
  const participant = meaning.participant ? text(meaning.participant) : '';
  const prefix = participant && m.startsWith(participant + ' ') ? participant.length : 0;
  const suffix =
    participant && m.endsWith(' de ' + participant) ? m.length - participant.length : m.length;
  return {
    market:
      m.slice(0, prefix) +
      m.slice(prefix, suffix).replace(/(^|[ (])mas(?=\s*\/\s*menos(?:[ )]|$))/g, '$1más') +
      m.slice(suffix),
    pick: p.replace(/^mas de /, 'más de '),
  };
}
export function automaticTerms(d: ParsedTicket, verifiedPlacement?: PlacementEvidence) {
  const e = settlementEvidence(d);
  const placement = verifiedPlacement ?? placementFromDraft(d);
  const visual = verifiedSelectionResults(d);
  return JSON.stringify({
    house: d.house,
    kind: d.kind,
    stake: d.stake,
    odds: d.odds,
    potential: d.potential,
    cashoutOffer: d.cashoutOffer,
    ticketReference: d.ticketReference,
    expectedSelections: d.expectedSelections,
    bonusAmount: d.bonusAmount,
    mode: captureMode(d),
    placementMode: betPlacementMode(d),
    placement: { status: placement.status, basis: placement.basis },
    ...(visual
      ? {
          selectionResults: visual.marks.map(({ selection, child, status }) => ({
            selection,
            child,
            status,
          })),
        }
      : {}),
    result: {
      kind: e.kind,
      returned: e.returned ?? e.receiptReturn,
      betDate: e.betDate,
      settlementDate: e.settlementDate,
      partial: e.partial,
      manualState: e.manualState,
      conflictingAmounts: e.conflictingAmounts,
    },
    selections: d.selections.map((s) => ({
      event: text(s.event),
      ...selectionTerms(s.market, s.pick, s.event),
      odds: s.odds,
      promotion: s.promotion,
      builderMarkets: s.builderMarkets?.map((m) => ({
        ...selectionTerms(m.market, m.pick, s.event),
        promotion: m.promotion,
      })),
    })),
  });
}
export function agreesPlacementFooter(d: ParsedTicket, text: string) {
  const original = placementFromText(d.text),
    footer = placementFromText(text);
  const footerSettlement = settlementEvidence({ ...d, text });
  return (
    !settlementEvidence(d).candidate &&
    original.status === 'confirmed' &&
    original.basis === 'cashout-available' &&
    !footerSettlement.candidate &&
    !footerSettlement.partial &&
    footer.status === 'confirmed' &&
    footer.basis === 'cashout-available' &&
    d.cashoutOffer !== undefined &&
    parseTicket(text).cashoutOffer === d.cashoutOffer
  );
}
export function agreedAutomaticEvidence(
  a: ParsedTicket,
  b: ParsedTicket,
  imageHash: string,
  placementRead?: string,
) {
  const first = automaticTerms(a),
    placement = placementFromText(b.text);
  // Missing a button on the second full pass is not execution evidence. A
  // separate contrast crop must read the SAME offer as the first full pass.
  const recovered =
    placementRead !== undefined &&
    agreesPlacementFooter(a, placementRead) &&
    !settlementEvidence(b).candidate &&
    placement.status === 'unknown' &&
    placement.basis === 'insufficient' &&
    b.cashoutOffer === undefined;
  const second = recovered
    ? automaticTerms({ ...b, cashoutOffer: a.cashoutOffer }, placementFromText(a.text))
    : automaticTerms(b);
  if (first !== second || a.reviewReasons?.length || b.reviewReasons?.length) return;
  return automaticEvidenceSchema.parse({
    version: 'critical-fields-v1',
    imageHash,
    terms: first,
    ...(recovered ? { placementRead } : {}),
  });
}
export function verifyAutomaticEvidence(d: ParsedTicket, imageHash: string) {
  const proof = automaticEvidenceSchema.safeParse(d.automaticEvidence);
  return (
    proof.success &&
    proof.data.imageHash === imageHash &&
    (!d.selectionResults ||
      (d.selectionResults.imageHash === imageHash && !!verifiedSelectionResults(d))) &&
    proof.data.terms === automaticTerms(d) &&
    (!proof.data.placementRead || agreesPlacementFooter(d, proof.data.placementRead))
  );
}
