import { transact } from './cloudStore';
import type { BettrackDB } from './db';
import { cloudDatabase } from './cloudStore';
export type CaptureFilter = 'all' | 'active' | 'attention' | 'saved';
const groups = {
  active: ['queued', 'processing'],
  attention: ['review', 'duplicate', 'error'],
  saved: ['saved', 'linked'],
};
export async function capturePage(
  filter: CaptureFilter,
  page: number,
  size: number,
  d: BettrackDB = cloudDatabase,
) {
  return transact(d,'r', d.uploads, async (d) => {
    const [total, active, attention, saved] = await Promise.all([
      d.uploads.count(),
      ...(['active', 'attention', 'saved'] as const).map((key) =>
        d.uploads.where('status').anyOf(groups[key]).count(),
      ),
    ]);
    const counts = { all: total, active, attention, saved },
      count = counts[filter],
      current = Math.min(Math.max(1, page), Math.max(1, Math.ceil(count / size)));
    const rows = await d.uploads
      .orderBy('createdAt')
      .reverse()
      .filter((u) => filter === 'all' || groups[filter].includes(u.status))
      .offset((current - 1) * size)
      .limit(size)
      .toArray();
    const retryable = await d.uploads.where('status').anyOf('error', 'review').count();
    return { rows, counts, count, current, retryable };
  });
}
