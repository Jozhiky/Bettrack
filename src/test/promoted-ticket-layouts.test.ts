import { it, expect, vi } from 'vitest';
import { parseTicket, placementFromText } from '../ocr/parser';
import { interpretMarket } from '../ocr/semantics';
import { interpretSelections, semanticReviewReasons } from '../ocr/semanticReview';
import { prepareAutomaticImport } from '../ocr/automaticImport';
import { settlementEvidence } from '../ocr/settlement';
import { readDraft } from '../ocr/review';
import type { OcrLine } from '../ocr/layout';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { confirmAutomaticBatch, confirmCaptureReview } from '../data/captures';
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

function line(text: string, x: number, y: number): OcrLine {
  let at = x;
  const words = text.split(' ').map((text) => {
    const x0 = at;
    at += text.length * 8 + 6;
    return { text, confidence: 95, bbox: { x0, x1: at - 6, y0: y, y1: y + 35 } };
  });
  return { text, words, confidence: 95, bbox: { x0: x, x1: at, y0: y, y1: y + 35 } };
}
function ufc({ banner = true, oldPrice = '508', result = 'Ganada' } = {}) {
  return [
    line('Betano', 90, 10),
    line('Simple S/10.32', 80, 70),
    line(result, 950, 70),
    ...(banner ? [line('27 20% SUPER MEJORADA', 170, 125)] : []),
    line('Luchador QA por', 170, 190),
    line(oldPrice, 850, 225),
    line('6.00', 1010, 225),
    line('KO, TKO o descalificación', 170, 260),
    line('Forma del Triunfo (7-way)', 170, 305),
    line('Luchador QA', 170, 355),
    line('Rival QB', 170, 405),
    line('Apuesta', 80, 480),
    line('S/10.32', 1000, 480),
    line('Ganancias', 80, 550),
    line('S/61.92', 1000, 550),
  ];
}
const parse = (lines: OcrLine[]) => parseTicket(lines.map((l) => l.text).join('\n'), lines);
function upload(draft: ReturnType<typeof parseTicket>) {
  return {
    id: 'u',
    imageId: 'i',
    status: 'review' as const,
    createdAt: '2026-10-20T16:00:00Z',
    reason: '',
    progress: 100,
    draftJson: JSON.stringify(draft),
  };
}
function boost() {
  return [
    line('S/25.00 Crear apuesta', 70, 20),
    line('vw CREAR APUESTA 2.00 >> 3.00', 70, 90),
    line('Súper aumento >>', 70, 150),
    line('y Más de 0 goles en la 1* mitad', 100, 215),
    line('1° tempo - Goles.', 100, 260),
    line('y Más de 0 goles en la 2" mitad', 100, 320),
    line('2° tiempo - Goles', 100, 365),
    line('vw Más de 7 tiros de esquina', 100, 425),
    line('Tiros de esquina', 100, 470),
    line('B', 70, 540),
    line('Club QA', 116, 540),
    line('K', 70, 600),
    line('Club QB', 116, 600),
    line('Apuesta', 70, 690),
    line('Ganancias', 700, 690),
    line('S/25.00', 70, 750),
    line('S/75.00', 700, 750),
  ];
}
it('recognizes a promoted combat method with its exact fighters, applied odds and actual paid return', () => {
  const p = parse(ufc());
  expect(p.selections).toHaveLength(1);
  expect(p).toMatchObject({
    stake: 1032,
    odds: 6,
    quotePromotion: { label: 'Super Mejorada', percent: 20, appliedOdds: 6 },
  });
  expect(p.selections[0]).toMatchObject({
    event: 'Luchador QA vs. Rival QB',
    market: 'Forma del Triunfo (7-way)',
    pick: 'Luchador QA por KO, TKO o descalificación',
    odds: 6,
  });
  expect(p.bonusAmount).toBeUndefined();
  const prepared = prepareAutomaticImport(upload(p), new Date().toISOString());
  expect(prepared.reasons).toEqual([]);
  expect(prepared.historical).toMatchObject({ kind: 'Ganada', closedStake: 1032, returned: 6192 });
  expect(prepared.historical!.returned - prepared.historical!.closedStake).toBe(5160);
});
it('does not repair unreadable prior odds or add the percentage twice', () => {
  const p = parse(ufc({ oldPrice: '500' }));
  expect(p.quotePromotion?.originalOdds).toBeUndefined();
  expect(settlementEvidence(p).receiptReturn).toBe(6192);
});
it('does not turn a promotional banner into a selection, result, deposit or cashout', () => {
  const p = parse(ufc({ result: 'Pendiente' }));
  expect(p.selections).toHaveLength(1);
  expect(settlementEvidence(p).kind).toBeUndefined();
  expect(p.cashoutOffer).toBeUndefined();
  expect(p.bonusAmount).toBeUndefined();
  expect(prepareAutomaticImport(upload(p), new Date().toISOString()).historical).toBeUndefined();
});
it.each(['Otro luchador por KO, TKO o descalificación', 'Luchador QA por método desconocido'])(
  'keeps ambiguous combat pick %s in review',
  (pick) => {
    expect(
      semanticReviewReasons([
        {
          path: 'selection',
          value: interpretMarket('Forma del Triunfo (7-way)', pick, 'Luchador QA vs. Rival QB'),
        },
      ]),
    ).not.toEqual([]);
  },
);
it('extracts bet365 Superaumento as one same-event builder with three markets and the final quoted odds', () => {
  const p = parse(boost());
  expect(p).toMatchObject({
    house: 'Bet365',
    houseBasis: 'superaumento-product-layout',
    kind: 'Simple',
    stake: 2500,
    odds: 3,
    quotePromotion: { label: 'Superaumento', originalOdds: 2, appliedOdds: 3 },
    displayedReturn: { amount: 7500, verified: false },
  });
  expect(p.selections).toHaveLength(1);
  expect(p.selections[0].event).toBe('Club QA vs. Club QB');
  expect(p.selections[0].builderMarkets).toHaveLength(3);
  expect(p.selections[0].odds).toBe(3);
  expect(p.reviewReasons).toEqual([]);
  expect(p.interpretations?.map((i) => i.value.period)).toEqual([
    'first-half',
    'second-half',
    'unspecified',
  ]);
  expect(p.interpretations?.map((i) => i.value.operator)).toEqual(['over', 'over', 'over']);
  expect(p.placement?.status).toBe('unknown');
  expect(p.potential).toBeUndefined();
  expect(settlementEvidence(p).returned).toBeUndefined();
});
it('does not infer settlement, execution or acceptance from product title, boost, money or check-shaped OCR letters', () => {
  const p = parse(boost());
  expect(settlementEvidence(p).kind).toBeUndefined();
  expect(p.visibleStatus).toBeUndefined();
  expect(p.cashoutOffer).toBeUndefined();
  const prepared = prepareAutomaticImport(upload(p), new Date().toISOString());
  expect(prepared.historical).toBeUndefined();
  expect(prepared.reasons.join(' ')).toContain('Superaumento leído');
  expect(prepared.reasons.join(' ')).not.toContain('Boleto abierto');
  expect(placementFromText('Crear apuesta 2.00 >> 3.00').status).toBe('unknown');
  expect(placementFromText('Crear apuesta\nApostar S/25.00').status).toBe('preparation');
});
it('requires the complete Superaumento layout and preserves unread old quote instead of making it 2.00', () => {
  expect(parse(boost().filter((l) => !/Súper aumento/.test(l.text))).house).toBeUndefined();
  expect(parse(boost().filter((l) => l.text !== 'Club QB')).selections).toHaveLength(0);
  const p = parse(
    boost().map((l) =>
      l.text.includes('2.00 >>') ? line('vw CREAR APUESTA 00 >> 3.00', 70, 90) : l,
    ),
  );
  expect(p.odds).toBe(3);
  expect(p.quotePromotion?.originalOdds).toBeUndefined();
});
it('does not transfer a bet365 product parser to a contradictory Betano brand', () => {
  const p = parse([line('Betano', 900, 10), ...boost()]);
  expect(p.house).toBe('Betano');
  expect(p.houseBasis).toBeUndefined();
  expect(p.quotePromotion).toBeUndefined();
});
it('uses the player-specific promotion as scope evidence without inventing a roster or substitute', () => {
  const row = {
    event: 'Club QA vs. Club QB',
    market: 'Bet Builder',
    pick: 'Bet Builder',
    sport: '',
    builderMarkets: [
      { market: 'Persona QA Tiros al Arco', pick: '1+', promotion: 'Suplente de Oro' as const },
      { market: 'Club QA Tiros al Arco', pick: '2+', promotion: 'Pago anticipado +2' as const },
    ],
  };
  const values = interpretSelections([row]);
  expect(values[0].value).toMatchObject({
    scope: 'player',
    participant: 'Persona QA',
    confidence: { participant: 'recognized' },
  });
  expect(values[1].value).toMatchObject({ scope: 'team', participant: 'Club QA' });
  expect(semanticReviewReasons(values)).toEqual([]);
  expect(interpretMarket('Persona QA Tiros al Arco', '1+', row.event).scope).toBe('unknown');
  expect(
    interpretMarket('Persona QA Tiros al Arco', '1+', row.event, '', {
      promotion: 'Pago anticipado +2',
    }).scope,
  ).toBe('unknown');
});
it('keeps mismatching bet365 periods unresolved and limits special interpretation to that product context', () => {
  const event = 'Club QA vs. Club QB';
  expect(
    interpretMarket('1° tiempo - Goles', 'Más de 0 goles en la 2ª mitad', event, '', {
      product: 'bet365-builder',
    }).scope,
  ).toBe('unknown');
  expect(interpretMarket('1° tempo - Goles', 'Más de 0 goles en la 1* mitad', event).scope).toBe(
    'unknown',
  );
});
it('rejects malformed cached promotional values without breaking older drafts', () => {
  const p = parse(ufc());
  const d = readDraft(
    JSON.stringify({
      ...p,
      quotePromotion: { label: 'Super Mejorada', percent: -20 },
      displayedReturn: { amount: 'invalid' },
    }),
  );
  expect(d).toBeDefined();
  expect(d?.quotePromotion).toBeUndefined();
  expect(d?.displayedReturn).toBeUndefined();
});
async function financialFixture(
  draft: ReturnType<typeof parseTicket>,
  run: (d: BettrackDB, r: LocalRepository) => Promise<void>,
) {
  const d = new BettrackDB('promoted-' + crypto.randomUUID());
  try {
    const r = new LocalRepository(d);
    await r.init();
    await d.images.add({
      id: 'i',
      hash: 'a'.repeat(64),
      name: 'synthetic.png',
      blob: new Blob(['synthetic']),
    });
    await d.uploads.add(upload(draft));
    await run(d, r);
  } finally {
    await d.delete();
  }
}
it('posts the promoted win exactly once after consent, without a second boost or deposit', async () =>
  financialFixture(parse(ufc()), async (d, r) => {
    const u = (await d.uploads.get('u'))!,
      p = prepareAutomaticImport(u, new Date(Date.now() - 1000).toISOString());
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
    expect(await d.movements.count()).toBe(0);
    await confirmAutomaticBatch([item], true, r);
    await confirmAutomaticBatch([item], true, r);
    const s = await r.snapshot();
    expect(s.bets).toHaveLength(1);
    expect(s.settlements).toHaveLength(1);
    expect(s.movements).toHaveLength(2);
    expect(s.settlements[0]).toMatchObject({ kind: 'Ganada', closedStake: 1032, returned: 6192 });
    expect(totals(s)).toMatchObject({ profit: 5160, deposits: 0, won: 1, pending: 0 });
    expect(JSON.parse((await d.uploads.get('u'))!.draftJson).quotePromotion.percent).toBe(20);
  }));
it('does not accept the unverified bet365 receipt even when a caller submits consent', async () =>
  financialFixture(parse(boost()), async (d, r) => {
    const u = (await d.uploads.get('u'))!,
      p = readDraft(u.draftJson)!;
    await expect(
      confirmCaptureReview(
        'u',
        { expectedDraft: u.draftJson, imageId: 'i', selections: p.selections, acknowledged: true },
        r,
      ),
    ).rejects.toThrow('comprobante de colocación');
    expect(await d.bets.count()).toBe(0);
    expect(await d.movements.count()).toBe(0);
  }));
it('registers a reviewed accepted builder as pending; green/offer context does not create a return or final settlement', async () => {
  const p = parseTicket(
    'Betano\nSimple S/20.10 2.92\nApuesta S/20.10\nGanancias potenciales S/58.69\nCASH OUT S/24.32',
  );
  p.selections = [
    {
      event: 'Club QA vs. Club QB',
      market: 'Bet Builder',
      pick: 'Bet Builder',
      odds: 2.92,
      sport: '',
      league: '',
      builderMarkets: [
        { market: 'Persona QA Tiros al Arco', pick: '1+', promotion: 'Suplente de Oro' },
        { market: 'Persona QB Tiros al Arco', pick: '2+', promotion: 'Suplente de Oro' },
        { market: 'Resultado del partido', pick: 'Club QA', promotion: 'Pago anticipado +2' },
        {
          market: 'Jugador que anota o da una asistencia',
          pick: 'Persona QB (Club QA)',
          promotion: 'Suplente de Oro',
        },
      ],
    },
  ];
  await financialFixture(p, async (d, r) => {
    const u = (await d.uploads.get('u'))!;
    expect(await d.movements.count()).toBe(0);
    await confirmCaptureReview(
      'u',
      { expectedDraft: u.draftJson, imageId: 'i', selections: p.selections, acknowledged: true },
      r,
    );
    const s = await r.snapshot();
    expect(s.bets).toHaveLength(1);
    expect(s.settlements).toHaveLength(0);
    expect(s.movements).toHaveLength(1);
    expect(totals(s)).toMatchObject({ pending: 1, cashouts: 0, profit: 0, committed: 2010 });
  });
});
