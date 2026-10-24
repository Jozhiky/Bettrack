import { fingerprint, type Bet, type Selection } from './model';
export type CaptureTerms = Pick<Bet, 'houseId' | 'stake' | 'odds' | 'date'>;
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
