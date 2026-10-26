import { z } from 'zod';
import type { ParsedTicket } from './parser';
import { placementFromText, parseTicket } from './parser';
import type { PlacementEvidence } from './placement';
import { settlementEvidence } from './settlement';
import { betPlacementMode, captureMode } from './visualMode';
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
export function automaticTerms(d: ParsedTicket, verifiedPlacement?: PlacementEvidence) {
  const e = settlementEvidence(d);
  const placement = verifiedPlacement ?? placementFromText(d.text);
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
      market: text(s.market),
      pick: text(s.pick),
      odds: s.odds,
      promotion: s.promotion,
      builderMarkets: s.builderMarkets?.map((m) => ({
        market: text(m.market),
        pick: text(m.pick),
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
    proof.data.terms === automaticTerms(d) &&
    (!proof.data.placementRead || agreesPlacementFooter(d, proof.data.placementRead))
  );
}
