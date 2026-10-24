import { it, expect, vi } from 'vitest';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { enrichCaptureModes } from '../data/captureVisualMode';
import { prepareAutomaticImport } from '../ocr/automaticImport';
import { readDraft } from '../ocr/review';
import type { VisualMode } from '../ocr/visualMode';
vi.mock('../integrations/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw Error('No production access');
      },
    },
  ),
}));
const hash = 'a'.repeat(64),
  proof: VisualMode = {
    mode: 'live',
    basis: 'betano-orange-lightning-v1',
    imageHash: hash,
    bbox: { x0: 0.89, y0: 0.54, x1: 0.92, y1: 0.59 },
  };
async function fixture(run: (d: BettrackDB, r: LocalRepository) => Promise<void>) {
  const d = new BettrackDB('visual-mode-' + crypto.randomUUID());
  try {
    const r = new LocalRepository(d);
    await r.init();
    await d.images.add({ id: 'i', hash, name: 'synthetic.png', blob: new Blob(['synthetic']) });
    const text = 'Betano\nSimple S/100.00 Cash Out\nApuesta S/100.00\nGanancias S/140.00';
    await d.uploads.add({
      id: 'u',
      imageId: 'i',
      status: 'review',
      progress: 100,
      reason: 'legacy',
      createdAt: '2026-10-20T15:00:00.000Z',
      draftJson: JSON.stringify({
        house: 'Betano',
        kind: 'Simple',
        stake: 10000,
        text,
        placementHold: { text },
        selections: [
          {
            event: 'Equipo QA vs. Equipo QB',
            market: 'Goles totales Más/Menos',
            pick: 'Más 2.5',
            odds: 2,
            sport: '',
            league: '',
          },
        ],
        warnings: [],
        confidence: {},
      }),
    });
    await run(d, r);
  } finally {
    await d.delete();
  }
}
it('recovers live evidence from existing pixels, preserving originals and holds with zero financial writes', async () =>
  fixture(async (d, r) => {
    const before = (await d.uploads.get('u'))!,
      image = await d.images.get('i');
    expect(prepareAutomaticImport(before, new Date().toISOString()).historical?.timing?.mode).toBe(
      'unknown',
    );
    const reader = vi.fn().mockResolvedValue(proof);
    await Promise.all([enrichCaptureModes(['u'], r, reader), enrichCaptureModes(['u'], r, reader)]);
    const u = (await d.uploads.get('u'))!,
      old = JSON.parse(before.draftJson),
      next = JSON.parse(u.draftJson);
    expect(next.visualMode).toEqual(proof);
    delete next.visualMode;
    expect(next).toEqual(old);
    expect(await d.images.get('i')).toEqual(image);
    expect(u.status).toBe('review');
    expect(prepareAutomaticImport(u, new Date().toISOString()).historical).toMatchObject({
      kind: 'Cashout',
      returned: 14000,
      timing: { mode: 'live' },
    });
    expect(await d.bets.count()).toBe(0);
    expect(await d.settlements.count()).toBe(0);
    expect(await d.movements.count()).toBe(0);
    expect(
      (await d.audit.toArray()).filter((a) => a.action === 'Reconocer modalidad visual de captura'),
    ).toHaveLength(1);
    await enrichCaptureModes(['u'], r, reader);
    expect(reader).toHaveBeenCalledTimes(2);
  }));
it.each(['saved', 'linked', 'queued'])('never rewrites an existing %s record', async (status) =>
  fixture(async (d, r) => {
    await d.uploads.update('u', { status: status as 'saved' | 'linked' | 'queued' });
    const reader = vi.fn().mockResolvedValue(proof);
    expect(await enrichCaptureModes(['u'], r, reader)).toEqual({ enriched: 0, failed: 0 });
    expect(reader).not.toHaveBeenCalled();
  }),
);
it('preserves a draft on image failure and rejects an unrelated image proof', async () =>
  fixture(async (d, r) => {
    const before = await d.uploads.get('u');
    expect(
      await enrichCaptureModes(['u'], r, async () => {
        throw Error('Synthetic unavailable image');
      }),
    ).toEqual({ enriched: 0, failed: 1 });
    expect(
      await enrichCaptureModes(['u'], r, async () => ({ ...proof, imageHash: 'b'.repeat(64) })),
    ).toEqual({ enriched: 0, failed: 1 });
    expect(await d.uploads.get('u')).toEqual(before);
  }));
it('does not overwrite a draft requeued while the pixel read was running', async () =>
  fixture(async (d, r) => {
    await enrichCaptureModes(['u'], r, async () => {
      await d.uploads.update('u', { status: 'queued' });
      return proof;
    });
    expect(readDraft((await d.uploads.get('u'))!.draftJson)?.visualMode).toBeUndefined();
  }));
