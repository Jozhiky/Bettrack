import { fingerprint, type Bet, type Selection } from './model';
export type CaptureTerms = Pick<Bet, 'houseId' | 'stake' | 'odds' | 'date'> &
  Pick<Bet, 'ticketReference'>;
export type CaptureRows = Pick<
  Selection,
  'event' | 'market' | 'pick' | 'builderMarkets' | 'promotion'
>[];
// Shared by the exact batch preview and the write boundary. Unknown total odds
// are a wildcard, not evidence that two otherwise identical tickets differ.
export function sameCaptureTerms(
  a: CaptureTerms,
  ar: CaptureRows,
  b: CaptureTerms,
  br: CaptureRows,
) {
  const unknown = a.odds === null || b.odds === null;
  const normalize = (t: CaptureTerms) => ({
    ...t,
    odds: unknown ? null : t.odds,
    date: '2000-01-01T12:00:00.000Z',
  });
  return fingerprint(normalize(a), ar) === fingerprint(normalize(b), br);
}
export function sameCaptureIdentity(
  a: CaptureTerms,
  ar: CaptureRows,
  b: CaptureTerms,
  br: CaptureRows,
) {
  if (a.ticketReference && b.ticketReference)
    return a.houseId === b.houseId && a.ticketReference === b.ticketReference;
  return sameCaptureTerms(a, ar, b, br);
}
