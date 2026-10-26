import { expect, it, vi } from 'vitest';
import { settlementEvidence } from '../ocr/settlement';
import { prepareAutomaticPending } from '../ocr/automaticPending';
import type { ParsedTicket } from '../ocr/parser';
import {
  findResultMarks,
  selectionResultTerms,
  verifiedSelectionResults,
} from '../ocr/selectionResults';
import { placementFromDraft } from '../ocr/parser';
import { canReviewCapture } from '../ocr/review';
import { agreedAutomaticEvidence, verifyAutomaticEvidence } from '../ocr/automaticEvidence';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture } from '../data/captures';
import { setAutomaticCaptures } from '../data/automaticCapturePolicy';
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

export function resultDraft(kind = 'Simple', status: 'lost' | 'won' = 'lost'): ParsedTicket {
  const builder = status === 'won';
  const selections = Array.from({ length: kind === 'Combinada' ? 3 : 1 }, (_, i) => ({
    event: `Equipo QA${i} vs. Equipo QB${i}`,
    market: builder ? 'Bet Builder' : 'Goles totales Más/Menos',
    pick: builder ? 'Bet Builder' : `Más de ${i ? '1.5' : '4.5'}`,
    odds: 2,
    sport: '',
    league: '',
    ...(builder
      ? {
          builderMarkets: [
            { market: 'Goles totales Más/Menos', pick: 'Más de 2.5' },
            { market: 'Tarjetas Totales Más/Menos', pick: 'Más de 1.5' },
            { market: 'Remates totales', pick: 'Más de 25.5' },
          ],
        }
      : {}),
  }));
  const draft: ParsedTicket = {
    house: 'Betano',
    kind,
    stake: 1500,
    odds: 2,
    potential: builder ? 3000 : 0,
    expectedSelections: selections.length,
    selections,
    warnings: [],
    confidence: {},
    text: `Betano\n${kind === 'Combinada' ? 'Combinada de 3' : 'Simple'} S/15.00 2.00\n${builder ? 'Bet Builder\n' : ''}Más de 4.5\nGoles totales Más/Menos\nEquipo QA0\nEquipo QB0\nApuesta S/15.00\nGanancias potenciales S/${builder ? '30.00' : '0.00'}`,
  };
  return Object.assign(draft, {
    selectionResults: {
      version: 'betano-selection-results-v1' as const,
      imageHash: 'a'.repeat(64),
      terms: selectionResultTerms(draft),
      marks: [
        {
          selection: 0,
          ...(builder ? { child: 1 } : {}),
          status,
          bbox: { x0: 0.35, y0: 0.4, x1: 0.39, y1: 0.44 },
        },
      ],
    },
  });
}

it.each(['Simple', 'Combinada'])(
  'recognizes the user-confirmed %s loss without a global badge',
  (kind) => {
    expect(settlementEvidence(resultDraft(kind))).toMatchObject({ kind: 'Perdida', returned: 0 });
  },
);
it('keeps a Builder with one green check pending and recognizes its accepted-ticket context', () => {
  const draft = resultDraft('Simple', 'won');
  expect(settlementEvidence(draft).candidate).toBe(false);
  const upload = {
    id: 'u',
    imageId: 'i',
    status: 'review' as const,
    progress: 100,
    reason: '',
    createdAt: new Date().toISOString(),
    draftJson: JSON.stringify(draft),
  };
  expect(prepareAutomaticPending(upload).reasons).toEqual([]);
});

it.each([
  'Sistema Yankee',
  'Cashout parcial',
  'Apuesta anulada',
  'Reembolso',
  'Seguro de apuesta',
  'Hándicap asiático',
  'Bono',
])('does not infer a total loss for %s', (label) => {
  const d = resultDraft();
  d.text += '\n' + label;
  d.selectionResults!.terms = selectionResultTerms(d);
  expect(settlementEvidence(d).kind).not.toBe('Perdida');
});
it.each([
  'CASH OUT S/8.00',
  'Cashout realizado S/8.00',
  'Importe cobrado S/5.00',
  'Simple S/15.00 Ganada',
])('does not replace %s with a loss', (label) => {
  const d = resultDraft();
  d.text += '\n' + label;
  d.selectionResults!.terms = selectionResultTerms(d);
  expect(settlementEvidence(d).kind).not.toBe('Perdida');
});
it('does not use zero potential, text X, or a clock without visual evidence as a result', () => {
  const d = resultDraft();
  delete d.selectionResults;
  d.text += '\nX\n90:00';
  expect(settlementEvidence(d).candidate).toBe(false);
  expect(placementFromDraft(d).status).toBe('unknown');
});
it('holds a red cross with nonzero potential and incomplete closure evidence', () => {
  const d = resultDraft();
  d.potential = 1000;
  d.text = d.text.replace('S/0.00', 'S/10.00');
  d.selectionResults!.terms = selectionResultTerms(d);
  expect(settlementEvidence(d)).toMatchObject({ candidate: true, kind: undefined });
});
it('rejects a mark linked to an absent selection and edits made after the visual read', () => {
  const d = resultDraft();
  d.selectionResults!.marks[0].selection = 6;
  expect(verifiedSelectionResults(d)).toBeUndefined();
  const changed = resultDraft();
  changed.selections[0].pick = 'Menos de 4.5';
  expect(verifiedSelectionResults(changed)).toBeUndefined();
});
it('keeps preparation evidence stronger than selection icons', () => {
  const d = resultDraft();
  d.text += '\nConfirmar apuesta';
  d.selectionResults!.terms = selectionResultTerms(d);
  expect(placementFromDraft(d).status).toBe('preparation');
  expect(canReviewCapture(d)).toBe(false);
});
it('never treats all green Builder children as a global winning receipt', () => {
  const d = resultDraft('Simple', 'won');
  d.selectionResults!.marks = [0, 1, 2].map((child) => ({
    ...d.selectionResults!.marks[0],
    child,
  }));
  expect(settlementEvidence(d)).toMatchObject({
    candidate: false,
    kind: undefined,
    returned: undefined,
  });
});
it('requires identical per-selection results in both passes and the same image hash', () => {
  const a = resultDraft(),
    b = resultDraft();
  b.selectionResults!.marks[0].status = 'won';
  expect(agreedAutomaticEvidence(a, b, 'a'.repeat(64))).toBeUndefined();
  a.automaticEvidence = agreedAutomaticEvidence(a, a, 'a'.repeat(64));
  expect(verifyAutomaticEvidence(a, 'a'.repeat(64))).toBe(true);
  a.selectionResults!.imageHash = 'b'.repeat(64);
  expect(verifyAutomaticEvidence(a, 'a'.repeat(64))).toBe(false);
});

function glyph(shape: string, scale = 1) {
  const width = 360 * scale,
    height = 400 * scale,
    data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < data.length; p += 4)
    data.set(shape === 'white-background' ? [255, 255, 255, 255] : [32, 36, 54, 255], p);
  const n = 12 * scale;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n,
        v = (y + 0.5) / n,
        r = Math.hypot(u - 0.5, v - 0.5),
        inner = u > 0.2 && u < 0.8 && v > 0.2 && v < 0.8;
      const hole =
        shape === 'ring'
          ? r < 0.3
          : shape === 'plus'
            ? inner && (Math.abs(u - 0.5) < 0.13 || Math.abs(v - 0.5) < 0.13)
            : shape === 'solid' || shape === 'rectangle'
              ? false
              : inner && (Math.abs(u - v) < 0.13 || Math.abs(u + v - 1) < 0.13);
      if ((shape === 'rectangle' || r <= 0.5) && !hole)
        data.set([255, 0, 80, 255], ((y + 120 * scale) * width + x + 126 * scale) * 4);
    }
  return { width, height, data };
}
it.each([1, 2, 3])('detects a synthetic red cross at scale %i', (scale) => {
  expect(findResultMarks(glyph('cross', scale))).toHaveLength(1);
});
it.each(['solid', 'ring', 'plus', 'rectangle', 'white-background'])(
  'rejects a %s as a lost selection',
  (shape) => {
    expect(findResultMarks(glyph(shape, 2))).toEqual([]);
  },
);

it.each(['Simple', 'Combinada', 'Builder'])(
  'books %s through existing atomic accounting without duplicate stakes',
  async (kind) => {
    const db = new BettrackDB('result-' + crypto.randomUUID());
    try {
      const repo = new LocalRepository(db);
      await repo.init();
      await setAutomaticCaptures(true, repo, 'isolated-test');
      const d = resultDraft(
        kind === 'Combinada' ? 'Combinada' : 'Simple',
        kind === 'Builder' ? 'won' : 'lost',
      );
      d.automaticEvidence = agreedAutomaticEvidence(d, d, 'a'.repeat(64));
      await db.images.add({
        id: 'i',
        hash: 'a'.repeat(64),
        name: 'synthetic.png',
        blob: new Blob(['synthetic']),
      });
      await db.uploads.add({
        id: 'u',
        imageId: 'i',
        createdAt: new Date().toISOString(),
        status: 'processing',
        progress: 0,
        reason: '',
        draftJson: '',
      });
      await registerCapture('u', d, repo);
      await registerCapture('u', d, repo);
      const s = await repo.snapshot();
      expect(s.bets).toHaveLength(1);
      expect(s.movements).toHaveLength(kind === 'Builder' ? 1 : 2);
      expect(s.settlements).toHaveLength(kind === 'Builder' ? 0 : 1);
      expect(totals(s).profit).toBe(kind === 'Builder' ? 0 : -1500);
      if (kind !== 'Builder')
        expect(s.settlements[0]).toMatchObject({ kind: 'Perdida', returned: 0, closedStake: 1500 });
      const audit = s.audit.find((a) => a.action === 'Registro automático de captura');
      expect(audit).toBeDefined();
    } finally {
      await db.delete();
    }
  },
);
it.each(['manual', 'prior-hold'])('preserves zero financial writes for %s', async (mode) => {
  const db = new BettrackDB('result-hold-' + crypto.randomUUID());
  try {
    const repo = new LocalRepository(db);
    await repo.init();
    if (mode === 'prior-hold') await setAutomaticCaptures(true, repo, 'isolated-test');
    const d = resultDraft();
    d.automaticEvidence = agreedAutomaticEvidence(d, d, 'a'.repeat(64));
    await db.images.add({
      id: 'i',
      hash: 'a'.repeat(64),
      name: 'synthetic.png',
      blob: new Blob(['synthetic']),
    });
    await db.uploads.add({
      id: 'u',
      imageId: 'i',
      createdAt: new Date().toISOString(),
      status: 'processing',
      progress: 0,
      reason: '',
      draftJson:
        mode === 'prior-hold' ? JSON.stringify({ ...d, placementHold: { text: d.text } }) : '',
    });
    await registerCapture('u', d, repo);
    expect(await db.bets.count()).toBe(0);
    expect(await db.movements.count()).toBe(0);
  } finally {
    await db.delete();
  }
});
