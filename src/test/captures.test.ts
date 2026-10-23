import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture, linkCapture, retryFailedCaptures } from '../data/captures';
import { capturePage } from '../data/capturePages';
import { id, position } from '../domain/model';
import type { ParsedTicket } from '../ocr/parser';
import { parseCSV, exportCSV } from '../data/transfer';
let db: BettrackDB, r: LocalRepository;
const now = '2026-10-15T18:00:00.000Z';
it.each(['queued', 'processing', 'review', 'error', 'duplicate'] as const)(
  'removes a %s capture atomically and late OCR cannot recreate its bet', async status => {
    const key = await upload();
    await db.uploads.update(key, { status });
    await r.removePendingCapture(key);
    await r.removePendingCapture(key);
    await registerCapture(key, parsed, r);
    expect(await db.uploads.get(key)).toBeUndefined();
    expect(await db.images.get(key)).toBeUndefined();
    expect(await db.bets.count()).toBe(0);
    expect(await db.movements.count()).toBe(0);
    expect(await db.audit.filter(a => a.action === 'Quitar captura pendiente').count()).toBe(1);
  },
);
it('preserves a registered bet and its image when removing a duplicate reference', async () => {
  const original = await upload();
  await registerCapture(original, parsed, r);
  const duplicate = id();
  await db.uploads.add({ id: duplicate, imageId: original, createdAt: now, status: 'duplicate', progress: 100, draftJson: '', reason: '', betId: original });
  const before = await r.snapshot();
  await r.removePendingCapture(duplicate);
  expect(await db.uploads.get(duplicate)).toBeUndefined();
  expect(await db.images.get(original)).toBeDefined();
  const after = await r.snapshot();
  expect(after.bets).toEqual(before.bets);
  expect(after.movements).toEqual(before.movements);
  await expect(r.removePendingCapture(original)).rejects.toThrow('ya está registrada');
  expect(await db.uploads.get(original)).toBeDefined();
});
it('keeps an image while another pending upload references it', async () => {
  const key = await upload();
  const duplicate = id();
  await db.uploads.add({ id: duplicate, imageId: key, createdAt: now, status: 'review', progress: 100, draftJson: '', reason: '' });
  await r.removePendingCapture(key);
  expect(await db.images.get(key)).toBeDefined();
  await r.removePendingCapture(duplicate);
  expect(await db.images.get(key)).toBeUndefined();
});
async function sharedBets() {
  const first = await upload(), second = id();
  await registerCapture(first, parsed, r);
  await db.uploads.add({id:second,imageId:first,createdAt:now,status:'queued',progress:0,draftJson:'',reason:'',allowDuplicate:true});
  await registerCapture(second, parsed, r);
  return {first,second};
}
it('deletes independent bets sharing one image without breaking the surviving reference', async () => {
  const {first,second} = await sharedBets();
  await r.deleteBet(first);
  expect(await db.images.get(first)).toBeDefined();
  expect((await db.bets.get(second))?.imageId).toBe(first);
  await r.deleteBet(second);
  expect(await db.images.count()).toBe(0);
});
it('removing one bet image preserves the other bet image and all financial data', async () => {
  const {first,second} = await sharedBets();
  const before = await db.movements.toArray();
  await r.removeImage(first);
  expect(await db.images.get(first)).toBeDefined();
  expect((await db.bets.get(second))?.imageId).toBe(first);
  await r.removeImage(second);
  expect(await db.images.count()).toBe(0);
  expect(await db.movements.toArray()).toEqual(before);
});
it('storage cleanup protects an open shared bet, then removes only evidence once both are settled', async () => {
  const {first,second} = await sharedBets();
  await r.settle({id:id(),betId:first,date:now,closedStake:700,returned:0,kind:'Perdida',note:''});
  expect(await r.removeSettledImages([first])).toBe(0);
  await r.settle({id:id(),betId:second,date:now,closedStake:700,returned:1008,kind:'Ganada',note:''});
  const before = await r.snapshot();
  expect(await r.removeSettledImages([first])).toBe(1);
  const after = await r.snapshot();
  expect(after.movements).toEqual(before.movements);
  expect(after.settlements).toEqual(before.settlements);
  expect(after.selections).toEqual(before.selections);
  expect(after.bets.map(b=>({...b,imageId:undefined}))).toEqual(before.bets.map(b=>({...b,imageId:undefined})));
  expect(await db.images.count()).toBe(0);
  expect(await db.uploads.count()).toBe(0);
});
it('registers using stored image metadata without downloading or rewriting the original', async () => {
  const key = await upload();
  const original = await db.images.get(key);
  const get = vi.spyOn(db.images, 'get');
  const put = vi.spyOn(db.images, 'put');
  await registerCapture(key, parsed, r);
  expect(get).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect((await db.bets.get(key))?.imageId).toBe(key);
  get.mockRestore();
  put.mockRestore();
  expect(await db.images.get(key)).toEqual(original);
});
it('retries only failed reads, preserving duplicate decisions and already saved bets', async () => {
  const states = ['error', 'review', 'duplicate', 'saved', 'linked', 'processing'] as const;
  for (const status of states) {
    const key = await upload(status.padEnd(64, 'a'));
    await db.uploads.update(key, { status, allowDuplicate: true, reason: status });
  }
  const before = await db.uploads.toArray();
  expect(await retryFailedCaptures(r)).toBe(2);
  const after = await db.uploads.toArray();
  for (const original of before) {
    const current = after.find((u) => u.id === original.id);
    if (['error', 'review'].includes(original.status))
      expect(current).toMatchObject({
        status: 'queued',
        enhanced: true,
        allowDuplicate: false,
        progress: 0,
      });
    else expect(current).toEqual(original);
  }
  expect(await db.movements.count()).toBe(0);
});
it('links a later screenshot as evidence without duplicating stake, changing return, or executing cashout', async () => {
  const a = await upload(),
    b = await upload('b'.repeat(64));
  await registerCapture(a, parsed, r);
  await db.uploads.update(b, { createdAt: '2026-10-16T18:00:00.000Z' });
  await registerCapture(b, { ...parsed, cashoutOffer: 500, potential: 1010 }, r);
  expect((await db.uploads.get(b))?.status).toBe('duplicate');
  await linkCapture(b, r);
  await linkCapture(b, r);
  expect((await db.uploads.get(b))?.status).toBe('linked');
  expect(await db.bets.count()).toBe(1);
  expect(await db.movements.count()).toBe(1);
  expect(await db.settlements.count()).toBe(0);
  expect((await db.bets.get(a))?.potential).toBe(1008);
  expect(await db.images.count()).toBe(2);
  expect(
    await db.audit.filter((a) => a.action === 'Vincular actualización de boleto').count(),
  ).toBe(1);
  db.close();
  await db.open();
  expect((await db.uploads.get(b))?.betId).toBe(a);
  await r.deleteBet(a);
  expect(await db.images.count()).toBe(0);
  expect(await db.uploads.count()).toBe(0);
});
it('rejects linking when its target was deleted', async () => {
  const a = await upload(),
    b = await upload();
  await registerCapture(a, parsed, r);
  await registerCapture(b, parsed, r);
  await r.deleteBet(a);
  await expect(linkCapture(b, r)).rejects.toThrow('coincidencia');
  expect(await db.bets.count()).toBe(0);
});
it('paginates beyond 50 captures and clamps page after filtering', async () => {
  await db.uploads.bulkAdd(
    Array.from({ length: 61 }, (_, i) => ({
      id: `p-${i}`,
      imageId: `p-${i}`,
      createdAt: new Date(Date.parse(now) + i * 1000).toISOString(),
      status: i % 2 ? ('queued' as const) : ('error' as const),
      progress: 0,
      draftJson: '',
      reason: '',
    })),
  );
  const first = await capturePage('all', 1, 12, db),
    last = await capturePage('all', 6, 12, db);
  expect(first.count).toBe(61);
  expect(first.rows).toHaveLength(12);
  expect(last.rows).toHaveLength(1);
  expect(last.rows[0].id).toBe('p-0');
  const filtered = await capturePage('attention', 6, 12, db);
  expect(filtered.current).toBe(3);
  expect(filtered.count).toBe(31);
  expect(filtered.rows.every((u) => u.status === 'error')).toBe(true);
});
it('retains screenshot selection order after database reload and preserves date provenance in CSV', async () => {
  const key = await upload();
  const selections = ['Primero', 'Segundo', 'Tercero'].map((event) => ({
    ...parsed.selections[0],
    event,
  }));
  await registerCapture(
    key,
    { ...parsed, kind: 'Combinada', expectedSelections: 3, selections },
    r,
  );
  db.close();
  await db.open();
  const snapshot = await r.snapshot();
  expect(snapshot.selections.map((s) => s.event)).toEqual(['Primero', 'Segundo', 'Tercero']);
  const imported = parseCSV(exportCSV(snapshot));
  expect(imported[0].bet).toMatchObject({ dateSource: 'upload', timingUnknown: true });
});
const parsed: ParsedTicket = {
  house: 'Betano',
  kind: 'Simple',
  stake: 700,
  odds: 1.44,
  potential: 1008,
  cashoutOffer: 640,
  expectedSelections: 1,
  selections: [
    {
      event: 'AC Sparta Praha vs. Lillestrom SK',
      market: 'Resultado del partido',
      pick: 'AC Sparta Praha',
      odds: 1.44,
      sport: 'Fútbol',
      league: '',
      promotion: 'Pago anticipado +2',
    },
  ],
  warnings: [],
  confidence: {},
  // This fixture represents an already placed bet; the write boundary now
  // requires that fact in the raw evidence, not only a cached cashout amount.
  text: 'Boleto de prueba\nApuesta confirmada',
};
beforeEach(async () => {
  db = new BettrackDB('intake-' + id());
  r = new LocalRepository(db);
  await r.init();
});
afterEach(async () => {
  await db.delete();
});
async function upload(hash = 'a'.repeat(64)) {
  const key = id();
  await db.images.add({
    id: key,
    hash,
    name: 'ticket.png',
    blob: new Blob(['test'], { type: 'image/png' }),
  });
  await db.uploads.add({
    id: key,
    imageId: key,
    createdAt: now,
    status: 'queued',
    progress: 0,
    draftJson: '',
    reason: '',
  });
  return key;
}
it('saves a complete capture without manual input or fabricated capital; repeated callbacks are idempotent', async () => {
  const key = await upload();
  await registerCapture(key, parsed, r);
  await registerCapture(key, parsed, r);
  expect(await db.bets.count()).toBe(1);
  const bet = (await db.bets.get(key))!;
  expect(bet).toMatchObject({
    date: now,
    dateSource: 'upload',
    timingUnknown: true,
    stake: 700,
    potential: 1008,
    streamerId: '',
    source: 'ocr',
  });
  expect(await db.settlements.count()).toBe(0);
  expect(position(bet, []).status).toBe('Pendiente');
  const moves = await db.movements.toArray();
  expect(moves).toHaveLength(1);
  expect(moves[0]).toMatchObject({ kind: 'Apuesta colocada', amount: -700 });
  expect((await db.uploads.get(key))?.status).toBe('saved');
  db.close();
  await db.open();
  expect(await db.bets.count()).toBe(1);
  expect(await db.images.count()).toBe(1);
});
it('holds incomplete images without inventing financial records', async () => {
  const key = await upload();
  await registerCapture(key, { ...parsed, stake: undefined }, r);
  expect((await db.uploads.get(key))?.status).toBe('review');
  expect(await db.bets.count()).toBe(0);
  expect(await db.movements.count()).toBe(0);
  expect(await db.images.count()).toBe(1);
});
it('holds missing combined legs', async () => {
  const key = await upload();
  await registerCapture(key, { ...parsed, kind: 'Combinada', expectedSelections: 11 }, r);
  expect((await db.uploads.get(key))?.reason).toContain('1 de 11');
  expect(await db.bets.count()).toBe(0);
});
it('retains recoverable data with absent odds even when a draft has no new metadata', async () => {
  const key = await upload();
  const draft = { ...parsed, selections: [{ ...parsed.selections[0], odds: null }] };
  await registerCapture(key, draft, r);
  const stored = (await db.uploads.get(key))!;
  expect(stored.status).toBe('review');
  expect(JSON.parse(stored.draftJson).selections).toEqual(draft.selections);
  expect(await db.bets.count()).toBe(0);
  expect(await db.movements.count()).toBe(0);
});
it('reviewing an ambiguous new capture cannot change historical bets or financial data', async () => {
  const existing = await upload();
  await registerCapture(existing, parsed, r);
  const before = await r.snapshot();
  const next = await upload('c'.repeat(64));
  await registerCapture(next, { ...parsed, reviewReasons: ['Mercado desconocido; revisión requerida.'] }, r);
  const after = await r.snapshot();
  for (const key of ['bets', 'selections', 'movements', 'settlements', 'houses', 'audit'] as const)
    expect(after[key]).toEqual(before[key]);
  expect((await db.uploads.get(next))?.status).toBe('review');
  expect(await db.images.get(next)).toBeDefined();
  // Already saved tickets bypass the new-draft gates and are never rewritten.
  await registerCapture(existing, { ...parsed, reviewReasons: ['Nueva lectura ambigua'] }, r);
  expect((await db.uploads.get(existing))?.status).toBe('saved');
  expect((await r.snapshot()).bets).toEqual(before.bets);
});
it('warns on identical images and requires an explicit override for a second operation', async () => {
  const a = await upload(),
    b = await upload();
  await registerCapture(a, parsed, r);
  await registerCapture(b, parsed, r);
  expect((await db.uploads.get(b))?.status).toBe('duplicate');
  expect(await db.bets.count()).toBe(1);
  await db.uploads.update(b, { allowDuplicate: true });
  await registerCapture(b, parsed, r);
  expect(await db.bets.count()).toBe(2);
  expect(await db.movements.count()).toBe(2);
});
it('detects semantic duplicates across different image files', async () => {
  const a = await upload(),
    b = await upload('b'.repeat(64));
  await registerCapture(a, parsed, r);
  await registerCapture(b, parsed, r);
  expect((await db.uploads.get(b))?.status).toBe('duplicate');
});
it('preserves original return and unresolved bonus without counting either as received', async () => {
  const key = await upload();
  await registerCapture(key, { ...parsed, potential: 1009, bonusAmount: 500 }, r);
  const bet = (await db.bets.get(key))!;
  expect(bet.bonus).toEqual({ amount: 500, treatment: 'Sin confirmar' });
  expect(bet.potential).toBe(1009);
  expect(position(bet, []).returned).toBe(0);
  expect((await db.selections.toArray())[0].promotion).toBe('Pago anticipado +2');
});
it('removes queued references when deleting a bet and leaves duplicate originals available', async () => {
  const a = await upload(),
    b = await upload();
  await registerCapture(a, parsed, r);
  await registerCapture(b, parsed, r);
  await r.deleteBet(a);
  expect(await db.uploads.get(a)).toBeUndefined();
  expect((await db.uploads.get(b))?.status).toBe('review');
  expect(await db.images.get(b)).toBeDefined();
  expect(await db.movements.count()).toBe(0);
});
