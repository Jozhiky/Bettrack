import type { Bet, CaptureUpload } from './model';

export type WorkspaceItem = { id: string; date: string } & (
  { type: 'bet'; bet: Bet } | { type: 'capture'; upload: CaptureUpload }
);
export function workspaceItems(
  bets: Bet[],
  uploads: CaptureUpload[],
  allBets: Bet[],
  includeCaptures: boolean,
  sort: string,
): WorkspaceItem[] {
  const recorded = new Set(allBets.map((b) => b.id));
  const items: WorkspaceItem[] = bets.map((bet) => ({
    type: 'bet',
    id: bet.id,
    date: bet.date,
    bet,
  }));
  if (includeCaptures)
    for (const upload of uploads) {
      // Saving a capture uses its ID as the bet ID. A live query may arrive
      // before the other subscription; never show both representations.
      if (!['saved', 'linked'].includes(upload.status) && !recorded.has(upload.id))
        items.push({ type: 'capture', id: upload.id, date: upload.createdAt, upload });
    }
  return items.sort((a, b) => {
    if (sort === 'stake') {
      if (a.type !== b.type) return a.type === 'capture' ? -1 : 1;
      if (a.type === 'bet' && b.type === 'bet' && a.bet.stake !== b.bet.stake)
        return b.bet.stake - a.bet.stake;
    }
    return (
      (sort === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
      a.id.localeCompare(b.id)
    );
  });
}
