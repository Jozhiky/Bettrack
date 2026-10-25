import { it, expect, vi } from 'vitest';
import { agreedFooter, footerValues, type ReceiptOcr } from '../ocr/receiptOcr';
import { settlementEvidence, needsReceiptRead } from '../ocr/settlement';
import { enrichCaptureReceipts } from '../data/captureReceipt';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { prepareAutomaticImport } from '../ocr/automaticImport';
import { confirmAutomaticBatch } from '../data/captures';
import { totals } from '../domain/model';
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
const hash = 'a'.repeat(64);
const proof: ReceiptOcr = {
  basis: 'betano-footer-tesseract-v1',
  imageHash: hash,
  text: 'Apuesta S/20.00\nGanancias $/31.00',
  enhancedText: 'Apuesta $/20.00\nGanancias S/31.00',
};
const draft = () => ({
  house: 'Betano',
  kind: 'Simple',
  stake: 2000,
  text: 'Betano\nSimple S/20.00 Ganada\nApuesta S/20.00\nGanancias s/31 ¿00',
  selections: [
    {
      event: 'Equipo QA vs. Equipo QB',
      market: 'Goles totales Más/Menos',
      pick: 'Más 2.5',
      odds: 1.55,
      sport: '',
      league: '',
    },
  ],
  warnings: [],
  confidence: {},
  placementHold: undefined,
});
it('reproduces the corrupt decimal and recovers two actual OCR reads without changing original text', () => {
  const d = draft();
  expect(needsReceiptRead(d)).toBe(true);
  expect(settlementEvidence(d).receiptReturn).toBeUndefined();
  expect(settlementEvidence({ ...d, receiptOcr: proof })).toMatchObject({
    kind: 'Ganada',
    receiptPaid: true,
    receiptReturn: 3100,
  });
  expect(d.text).toContain('31 ¿00');
});
it.each([
  'Apuesta S/20.00\nGanancias potenciales S/31.00',
  'Apuesta S/20.00\nCASH OUT S/31.00',
  'Apuesta S/20.00\nGanancias S/31 ¿00',
  'Apuesta S/20.00\nGanancias S/31.00\nGanancias S/40.00',
  'Ganancias S/31.00',
])('rejects incomplete, corrupt and unexecuted crop: %s', (text) => {
  expect(footerValues(text)).toBeUndefined();
  expect(agreedFooter({ ...proof, text })).toBeUndefined();
});
it('keeps disagreement between contrast passes unresolved', () => {
  expect(
    agreedFooter({ ...proof, enhancedText: proof.text.replace('31.00', '81.00') }),
  ).toBeUndefined();
});
it.each([
  ['Ganada', 3100],
  ['Cash Out', 3100],
  ['Cash Out', 1400],
  ['Cash Out', 2000],
])('preserves final state %s with actual return %i, independently of profit', (kind, returned) => {
  const printed = (returned / 100).toFixed(2),
    damaged = printed.replace('.', ' ¿');
  const d = { ...draft(), text: draft().text.replace('Ganada', kind).replace('31 ¿00', damaged) };
  const p = {
    ...proof,
    text: proof.text.replace('31.00', printed),
    enhancedText: proof.enhancedText.replace('31.00', printed),
  };
  expect(settlementEvidence({ ...d, receiptOcr: p })).toMatchObject({
    kind: kind === 'Cash Out' ? 'Cashout' : kind,
    receiptReturn: returned,
  });
});
it.each([
  [
    'offered',
    'Betano\nSimple S/20.00 1.55\nApuesta S/20.00\nGanancias potenciales S/31.00\nCASH OUT S/24.32',
  ],
  ['partial', draft().text + '\nCashout parcial'],
  ['contradictory', draft().text + '\nImporte cobrado S/40.00'],
  ['different digits', draft().text.replace('31 ¿00', '81 ¿00')],
  ['different stake', draft().text.replace('Apuesta S/20.00', 'Apuesta S/25.00')],
  ['negative amount', draft().text.replace('31 ¿00', '-31 ¿00')],
])('does not recover %s as a paid receipt', (_, text) => {
  expect(settlementEvidence({ ...draft(), text, receiptOcr: proof }).receiptPaid).toBe(false);
});
async function fixture(run: (d: BettrackDB, r: LocalRepository) => Promise<void>) {
  const d = new BettrackDB('receipt-' + crypto.randomUUID());
  try {
    const r = new LocalRepository(d);
    await r.init();
    await d.images.add({ id: 'i', hash, name: 'synthetic.png', blob: new Blob(['synthetic']) });
    await d.uploads.add({
      id: 'u',
      imageId: 'i',
      status: 'review',
      createdAt: '2026-10-20T16:00:00Z',
      progress: 100,
      reason: 'legacy',
      draftJson: JSON.stringify(draft()),
    });
    await run(d, r);
  } finally {
    await d.delete();
  }
}
it('recovers an old upload exactly once under concurrency, preserves originals and writes no finances before consent', async () =>
  fixture(async (d, r) => {
    const before = (await d.uploads.get('u'))!,
      image = await d.images.get('i'),
      reader = vi.fn().mockResolvedValue(proof);
    await Promise.all([
      enrichCaptureReceipts(['u'], r, reader),
      enrichCaptureReceipts(['u'], r, reader),
    ]);
    const u = (await d.uploads.get('u'))!,
      next = JSON.parse(u.draftJson);
    expect(next.receiptOcr).toEqual(proof);
    delete next.receiptOcr;
    expect(next).toEqual(JSON.parse(before.draftJson));
    expect(await d.images.get('i')).toEqual(image);
    expect(await d.bets.count()).toBe(0);
    expect(await d.movements.count()).toBe(0);
    expect(await d.settlements.count()).toBe(0);
    expect(
      (await d.audit.toArray()).filter((a) => a.action === 'Recuperar lectura de cobro de captura'),
    ).toHaveLength(1);
    await enrichCaptureReceipts(['u'], r, reader);
    expect(reader).toHaveBeenCalledTimes(2);
    const at = new Date(Date.now() - 1000).toISOString(),
      p = prepareAutomaticImport(u, at);
    expect(p.reasons).toEqual([]);
    expect(p.historical?.returned).toBe(3100);
    const item = {
      uploadId: 'u',
      expectedOutcome: 'saved' as const,
      confirmation: {
        expectedDraft: u.draftJson,
        imageId: 'i',
        selections: p.draft!.selections,
        acknowledged: true as const,
        historical: p.historical!,
      },
    };
    await expect(confirmAutomaticBatch([item], false, r)).rejects.toThrow();
    expect(await d.bets.count()).toBe(0);
    await confirmAutomaticBatch([item], true, r);
    await confirmAutomaticBatch([item], true, r); // Lost response retry.
    expect(await d.bets.count()).toBe(1);
    expect(await d.settlements.count()).toBe(1);
    expect(await d.movements.count()).toBe(2);
    expect((await d.settlements.toArray())[0]).toMatchObject({
      kind: 'Ganada',
      returned: 3100,
      closedStake: 2000,
    });
    expect(totals(await r.snapshot()).profit).toBe(1100);
  }));
it.each(['saved', 'linked', 'queued'])('does not change %s records', async (status) =>
  fixture(async (d, r) => {
    await d.uploads.update('u', { status: status as 'saved' | 'linked' | 'queued' });
    const reader = vi.fn();
    expect(await enrichCaptureReceipts(['u'], r, reader)).toEqual({ enriched: 0, failed: 0 });
    expect(reader).not.toHaveBeenCalled();
  }),
);
it('preserves the draft on download failure and mismatched image hash', async () =>
  fixture(async (d, r) => {
    const before = await d.uploads.get('u');
    expect(
      await enrichCaptureReceipts(['u'], r, async () => {
        throw Error('Offline');
      }),
    ).toEqual({ enriched: 0, failed: 1 });
    expect(
      await enrichCaptureReceipts(['u'], r, async () => ({ ...proof, imageHash: 'b'.repeat(64) })),
    ).toEqual({ enriched: 0, failed: 1 });
    expect(await d.uploads.get('u')).toEqual(before);
  }));
it('does not overwrite a draft edited while OCR was running', async () =>
  fixture(async (d, r) => {
    await enrichCaptureReceipts(['u'], r, async () => {
      await d.uploads.update('u', {
        reason: 'new',
        draftJson: JSON.stringify({ ...draft(), stake: 2500 }),
      });
      return proof;
    });
    expect(JSON.parse((await d.uploads.get('u'))!.draftJson).receiptOcr).toBeUndefined();
  }));
it('rejects a proof transplanted from another image at financial confirmation', async () =>
  fixture(async (d, r) => {
    const u = (await d.uploads.get('u'))!;
    u.draftJson = JSON.stringify({
      ...draft(),
      receiptOcr: { ...proof, imageHash: 'b'.repeat(64) },
    });
    await d.uploads.put(u);
    const p = prepareAutomaticImport(u, new Date(Date.now() - 1000).toISOString());
    await expect(
      confirmAutomaticBatch(
        [
          {
            uploadId: 'u',
            expectedOutcome: 'saved',
            confirmation: {
              expectedDraft: u.draftJson,
              imageId: 'i',
              selections: p.draft!.selections,
              acknowledged: true,
              historical: p.historical!,
            },
          },
        ],
        true,
        r,
      ),
    ).rejects.toThrow('no corresponde a esta imagen');
    expect(await d.bets.count()).toBe(0);
    expect(await d.movements.count()).toBe(0);
  }));
