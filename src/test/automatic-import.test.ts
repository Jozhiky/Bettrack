import { describe, it, expect, vi } from 'vitest';
import {
  prepareAutomaticImport,
  captureTiming,
  previewAutomaticBatch,
} from '../ocr/automaticImport';
import { confirmAutomaticBatch } from '../data/captures';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { betSchema, totals, type CaptureUpload } from '../domain/model';
import { readDraft } from '../ocr/review';
import { exportCSV, validateBackup } from '../data/transfer';
import { defaultSettings, emptySnapshot } from '../domain/model';
import { interpretSelections, semanticReviewReasons } from '../ocr/semanticReview';
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
const now = () => new Date(Date.now() - 1000).toISOString();
export function syntheticUpload(kind = 'Ganada', payout = 'Ganancias S/140.00'): CaptureUpload {
  return {
    id: crypto.randomUUID(),
    imageId: crypto.randomUUID(),
    status: 'review',
    createdAt: '2026-10-20T16:00:00.000Z',
    progress: 100,
    reason: 'Revisa fechas',
    draftJson: JSON.stringify({
      house: 'Betano',
      kind: 'Simple',
      stake: 10000,
      text: `Betano\nSimple S/100.00 ${kind === 'Cashout' ? 'Cash Out' : kind}\nEquipo QA vs. Equipo QB Hoy 18:00\nGoles totales Más/Menos\nMás 2.5\n2.00\nApuesta S/100.00\n${payout}`,
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
  };
}
function item(u: CaptureUpload, at = now()) {
  const p = prepareAutomaticImport(u, at);
  expect(p.reasons).toEqual([]);
  expect(p.historical).toBeDefined();
  return {
    uploadId: u.id,
    expectedOutcome: 'saved' as 'saved' | 'duplicate',
    confirmation: {
      expectedDraft: u.draftJson,
      imageId: u.imageId,
      selections: p.draft!.selections,
      acknowledged: true,
      historical: p.historical!,
    },
  };
}
async function fixture(run: (d: BettrackDB, r: LocalRepository) => Promise<void>) {
  const d = new BettrackDB('automatic-' + crypto.randomUUID());
  try {
    const r = new LocalRepository(d);
    await r.init();
    await run(d, r);
  } finally {
    await d.delete();
  }
}
async function seed(d: BettrackDB, u: CaptureUpload, hash = u.imageId) {
  await d.images.add({ id: u.imageId, hash, name: 'synthetic.png', blob: new Blob(['synthetic']) });
  await d.uploads.add(u);
}
describe('automatic historical preparation', () => {
  it('excludes duplicate finances from the exact preview before consent, including a changed representative', () => {
    const a = syntheticUpload(),
      b = syntheticUpload();
    const p = previewAutomaticBatch([a, b], now(), emptySnapshot, []);
    expect(p.ready.map((r) => r.expectedOutcome)).toEqual(['saved', 'duplicate']);
    expect(
      p.ready
        .filter((r) => r.expectedOutcome === 'saved')
        .reduce((n, r) => n + r.historical!.closedStake, 0),
    ).toBe(10000);
    expect(
      previewAutomaticBatch([a, b], now(), emptySnapshot, [a.id]).ready.map(
        (r) => r.expectedOutcome,
      ),
    ).toEqual(['saved']);
  });
  it('preserves actual labeled instants separately and rejects contradictory chronology', () => {
    const u = syntheticUpload(),
      d = JSON.parse(u.draftJson);
    d.text +=
      '\nFecha de apuesta: 2026-10-19T15:00:00Z\nFecha de liquidación: 2026-10-20T10:00:00Z';
    u.draftJson = JSON.stringify(d);
    expect(item(u).confirmation.historical.timing).toMatchObject({
      betAt: '2026-10-19T15:00:00.000Z',
      settledAt: '2026-10-20T10:00:00.000Z',
    });
    d.text = d.text.replace('2026-10-20T10:00:00Z', '2026-10-18T10:00:00Z');
    u.draftJson = JSON.stringify(d);
    expect(prepareAutomaticImport(u, now()).historical).toBeUndefined();
  });
  it('rejects a mismatched paid footer and contradictory global states', () => {
    for (const fault of ['Apuesta S/100.00', 'Simple S/100.00 Ganada']) {
      const u = syntheticUpload();
      const d = JSON.parse(u.draftJson);
      d.text = fault.startsWith('Apuesta')
        ? d.text.replace(fault, 'Apuesta S/50.00')
        : d.text + '\nSimple S/100.00 Perdida';
      u.draftJson = JSON.stringify(d);
      expect(prepareAutomaticImport(u, now()).historical).toBeUndefined();
    }
  });
  it.each([
    'Tarjetas Totales Más/Menos',
    'Equipo QA Más/Menos Córners',
    'Equipo QA Tarjetas Totales Más/Menos',
    'Asiático (Más/Menos) - Córners Totales Primer Tiempo',
  ])(
    'recognizes a complete observed match/team label without inventing a participant: %s',
    (market) => {
      const s = { event: 'Equipo QA vs. Equipo QB', market, pick: 'Más 2.5', sport: '' };
      expect(semanticReviewReasons(interpretSelections([s]))).toEqual([]);
    },
  );
  it('does not shift a later event date when an earlier leg lacks a schedule', () => {
    const u = syntheticUpload('Perdida', ''),
      d = readDraft(u.draftJson)!;
    d.selections = [0, 1, 2].map((i) => ({
      ...d.selections[0],
      event: `Club QA${i} vs. Club QB${i}`,
    }));
    d.text =
      'Betano\nCombinada de 3 S/100.00 Perdida\nClub QA0\nHoy 10:00\nClub QB0\nClub QA1\nClub QB1\nClub QA2\nMañana 19:00\nClub QB2';
    expect(captureTiming(d, u, now()).events.map((e) => e.selection)).toEqual([0, 2]);
  });
  it.each([
    ['Ganada', 14000],
    ['Perdida', 0],
    ['Cashout', 14000],
    ['Cashout', 7000],
    ['Cashout', 10000],
  ] as const)('prepares %s / %i without date fields', (kind, returned) => {
    const u = syntheticUpload(
      kind,
      kind === 'Perdida' ? '' : `Ganancias S/${(returned / 100).toFixed(2)}`,
    );
    const h = item(u).confirmation.historical;
    expect(h.returned).toBe(returned);
    expect(h.kind).toBe(kind);
    expect(h.timing).toMatchObject({
      betAt: null,
      settledAt: null,
      uploadedAt: u.createdAt,
      mode: 'unknown',
    });
    expect(h.header).toMatchObject({ odds: null, potential: null });
  });
  it.each([
    '',
    'Ganancias s/31 ¿00',
    'Ganancias potenciales S/140.00',
    'Ganancias S/140.00\nCASH OUT S/80.00',
    'Ganancias S/140.00\nCashout parcial',
    'Ganancias S/140.00\nImporte cobrado S/70.00',
  ])('excludes missing, potential, offered, partial or contradictory payout: %s', (line) => {
    expect(
      prepareAutomaticImport(syntheticUpload('Cashout', line), now()).historical,
    ).toBeUndefined();
  });
  it('never infers payout from selection odds; a plain footer without a terminal status cannot credit', () => {
    expect(
      prepareAutomaticImport(syntheticUpload('', 'Ganancias S/140.00\nCASH OUT S/80.00'), now())
        .historical,
    ).toBeUndefined();
    expect(prepareAutomaticImport(syntheticUpload('Ganada', ''), now()).historical).toBeUndefined();
  });
  it('truncates combination once and leaves potential unknown', () => {
    const u = syntheticUpload('Perdida', '');
    const d = JSON.parse(u.draftJson);
    d.kind = 'Combinada';
    d.text = d.text.replace('Simple', 'Combinada de 3');
    d.expectedSelections = 3;
    d.selections = [2.02, 2.15, 1.36].map((odds, i) => ({
      ...d.selections[0],
      odds,
      event: `QA${i} vs. QB${i}`,
    }));
    u.draftJson = JSON.stringify(d);
    expect(item(u).confirmation.historical.header).toMatchObject({
      odds: 5.9,
      oddsSource: 'selection-product',
      potential: null,
    });
  });
  it('keeps missing leg odds, preparation holds and missing selections out of the batch', () => {
    for (const fault of ['odds', 'count', 'hold']) {
      const u = syntheticUpload();
      const d = JSON.parse(u.draftJson);
      if (fault === 'odds') d.selections[0].odds = null;
      if (fault === 'count') d.expectedSelections = 2;
      if (fault === 'hold') d.placementHold = { text: 'Crear apuesta\nApostar S/100.00' };
      u.draftJson = JSON.stringify(d);
      expect(prepareAutomaticImport(u, now()).historical).toBeUndefined();
    }
  });
  it('retains an old insufficient hold alongside the now-readable paid receipt; never clears it', () => {
    const u = syntheticUpload('Cashout');
    const d = JSON.parse(u.draftJson);
    d.placementHold = { text: d.text };
    u.draftJson = JSON.stringify(d);
    expect(item(u).confirmation.expectedDraft).toContain('placementHold');
  });
  it('separates event schedule and upload-relative references from actual dates and live placement', () => {
    const u = syntheticUpload('Perdida', '');
    const d = readDraft(u.draftJson)!;
    d.text += '\nMañana 09:30\n24/10/2026 18:15\n31/02/2026 12:00\n4%66:14\n70:00';
    const t = captureTiming(d, u, now());
    expect(t.betAt).toBeNull();
    expect(t.settledAt).toBeNull();
    expect(t.mode).toBe('unknown');
    expect(t.events.map((e) => e.at)).toEqual([
      '2026-10-20T23:00:00.000Z',
      '2026-10-21T14:30:00.000Z',
      '2026-10-24T23:15:00.000Z',
    ]);
    expect(t.events[0].basis).toBe('upload-reference');
    expect(t.events[2].basis).toBe('ticket-calendar');
    d.text += '\nApuesta en vivo';
    expect(captureTiming(d, u, now()).mode).toBe('live');
    d.text = d.text.replace('Apuesta en vivo', 'Apuesta prematch');
    expect(captureTiming(d, u, now()).mode).toBe('prematch');
  });
});
describe('atomic batch and explicit consent', () => {
  it('rolls back if actual duplicates differ from the consented financial summary', async () =>
    fixture(async (d, r) => {
      const a = syntheticUpload(),
        b = syntheticUpload();
      await seed(d, a);
      await seed(d, b);
      await expect(confirmAutomaticBatch([item(a), item(b)], true, r)).rejects.toThrow(
        'duplicados',
      );
      expect(await d.bets.count()).toBe(0);
      expect(await d.movements.count()).toBe(0);
    }));
  it('saves existing drafts without reupload, records 2 movements each, preserves unknown dates and is replay-safe', async () =>
    fixture(async (d, r) => {
      const a = syntheticUpload(),
        b = syntheticUpload('Perdida', '');
      const bd = JSON.parse(b.draftJson);
      bd.selections[0].event = 'Equipo QC vs. Equipo QD';
      b.draftJson = JSON.stringify(bd);
      b.status = 'error';
      await seed(d, a);
      await seed(d, b);
      const items = [item(a), item(b)];
      await expect(confirmAutomaticBatch(items, false, r)).rejects.toThrow('Confirma');
      expect(await d.bets.count()).toBe(0);
      expect(await d.movements.count()).toBe(0);
      await Promise.all([
        confirmAutomaticBatch(items, true, r),
        confirmAutomaticBatch(items, true, r),
      ]);
      await confirmAutomaticBatch(items, true, r); // lost response / replay
      const s = await r.snapshot();
      expect(s.bets).toHaveLength(2);
      expect(s.settlements).toHaveLength(2);
      expect(s.movements).toHaveLength(4);
      expect(s.audit.filter((a) => a.action === 'Confirmar lote histórico')).toHaveLength(1);
      expect((await d.uploads.get(a.id))?.draftJson).toContain('"humanReviewed":false');
      expect(totals(s).profit).toBe(-6000);
      expect(s.bets[0]).toMatchObject({
        dateSource: 'accounting',
        historicalTiming: { betAt: null, settledAt: null },
      });
      expect(betSchema.safeParse(s.bets[0]).success).toBe(true);
      expect((await d.uploads.get(a.id))?.draftJson).toContain('Ganancias');
      const backup = {
        format: 'bettrack',
        version: 1,
        createdAt: now(),
        data: s,
        settings: defaultSettings,
        uploads: await d.uploads.toArray(),
        images: (await d.images.toArray()).map((im) => ({
          id: im.id,
          hash: 'a'.repeat(64),
          name: 'synthetic.png',
          data: 'data:image/png;base64,c3ludGhldGlj',
        })),
      };
      expect(validateBackup(backup).data.bets[0].historicalTiming?.betAt).toBeNull();
      expect(exportCSV(s)).toContain('Cronología histórica JSON');
      const invalid = structuredClone(backup);
      invalid.data.settlements = [];
      invalid.data.movements = invalid.data.movements.filter((m) => !m.settlementId);
      expect(() => validateBackup(invalid)).toThrow('liquidación');
      await expect(r.undoSettlement(s.settlements[0].id)).rejects.toThrow('fechas desconocidas');
    }));
  it('deduplicates two images of the same ticket without a second charge', async () =>
    fixture(async (d, r) => {
      const a = syntheticUpload(),
        b = syntheticUpload();
      await seed(d, a);
      await seed(d, b);
      const items = [item(a), item(b)];
      items[1].expectedOutcome = 'duplicate';
      expect(await confirmAutomaticBatch(items, true, r)).toEqual({ saved: 1, duplicates: 1 });
      await confirmAutomaticBatch(items, true, r);
      expect(await d.bets.count()).toBe(1);
      expect(await d.movements.count()).toBe(2);
    }));
  it.each(['stale', 'tampered', 'expired'])(
    'rolls back the entire batch on %s confirmation',
    async (fault) =>
      fixture(async (d, r) => {
        const a = syntheticUpload(),
          b = syntheticUpload('Perdida', '');
        await seed(d, a);
        await seed(d, b);
        const items = [item(a), item(b)];
        if (fault === 'stale') await d.uploads.update(b.id, { draftJson: b.draftJson + ' ' });
        if (fault === 'tampered') items[1].confirmation.historical.returned = 1;
        if (fault === 'expired')
          items[1] = item(b, new Date(Date.now() - 11 * 60 * 1000).toISOString());
        await expect(confirmAutomaticBatch(items, true, r)).rejects.toThrow();
        expect(await d.bets.count()).toBe(0);
        expect(await d.movements.count()).toBe(0);
        expect((await d.uploads.get(a.id))?.status).toBe('review');
      }),
  );
});
