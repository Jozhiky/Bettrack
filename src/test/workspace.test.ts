import { expect, it } from 'vitest';
import { workspaceItems } from '../domain/workspace';
import { betSchema, uploadSchema } from '../domain/model';

const date = '2026-10-16T12:00:00.000Z';
const bet = betSchema.parse({
  id: 'ticket',
  date,
  houseId: 'house',
  streamerId: '',
  kind: 'Simple',
  live: false,
  odds: 2,
  stake: 1000,
  potential: 2000,
  notes: '',
  source: 'ocr',
  fingerprint: 'a',
  createdAt: date,
  updatedAt: date,
});
const upload = uploadSchema.parse({
  id: bet.id,
  imageId: 'image',
  createdAt: date,
  status: 'processing',
  progress: 40,
  draftJson: '',
  reason: '',
});

it('replaces an OCR item with the bet using one stable identity, even with lagging subscriptions', () => {
  const before = workspaceItems([], [upload], [], true, 'new');
  const after = workspaceItems([bet], [upload], [bet], true, 'new');
  expect(before.map((i) => i.id)).toEqual(after.map((i) => i.id));
  expect(after).toHaveLength(1);
  expect(after[0].type).toBe('bet');
});
it('keeps a possible duplicate visible even when it references an existing bet', () => {
  const duplicate = { ...upload, id: 'second', status: 'duplicate' as const, betId: bet.id };
  expect(workspaceItems([bet], [duplicate], [bet], true, 'new')).toHaveLength(2);
});
it('omits linked and saved jobs, including after a saved bet has been deleted', () => {
  expect(
    workspaceItems(
      [],
      [
        { ...upload, status: 'saved' },
        { ...upload, id: 'linked', status: 'linked' },
      ],
      [],
      true,
      'new',
    ),
  ).toEqual([]);
});
it('does not resurrect a filtered bet as an OCR item or include jobs in finished bets', () => {
  expect(workspaceItems([], [upload], [bet], true, 'new')).toEqual([]);
  expect(workspaceItems([], [upload], [], false, 'new')).toEqual([]);
});
it('paginates a single stable chronological sequence of bets and unresolved jobs', () => {
  const uploads = Array.from({ length: 13 }, (_, i) => ({
    ...upload,
    id: `upload-${i}`,
    createdAt: new Date(Date.parse(date) + i * 1000).toISOString(),
  }));
  const items = workspaceItems([bet], uploads, [bet], true, 'new');
  expect(items.slice(0, 12)).toHaveLength(12);
  expect(items.slice(12)).toHaveLength(2);
  expect(new Set(items.map((i) => i.id)).size).toBe(14);
  expect(items[0].id).toBe('upload-12');
  expect(workspaceItems([bet], [...uploads].reverse(), [bet], true, 'new')).toEqual(items);
});
