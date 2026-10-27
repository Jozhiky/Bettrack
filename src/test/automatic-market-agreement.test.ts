import { describe, expect, it } from 'vitest';
import {
  agreedAutomaticEvidence,
  automaticTerms,
  verifyAutomaticEvidence,
} from '../ocr/automaticEvidence';
import { parseTicket, type ParsedTicket } from '../ocr/parser';
import { interpretMarket } from '../ocr/semantics';
import { line } from '../../tests/ocr-phase1/controlled';

const hash = 'a'.repeat(64);
function ticket(market = 'Goles totales Más/Menos', pick = 'Más de 1.5'): ParsedTicket {
  return {
    house: 'Betano',
    kind: 'Simple',
    stake: 1000,
    odds: 2,
    potential: 2000,
    expectedSelections: 1,
    text: 'Betano\nSimple S/10.00 2.00\nApuesta S/10.00\nGanancias potenciales S/20.00\nApuesta aceptada',
    selections: [
      { event: 'Equipo QA vs. Equipo QB', market, pick, odds: 2, sport: '', league: '' },
    ],
    warnings: [],
    reviewReasons: [],
    confidence: {},
  };
}
function withoutAccent(a: ParsedTicket) {
  const b = structuredClone(a);
  for (const s of b.selections) {
    s.market = s.market.replaceAll('Más', 'Mas');
    s.pick = s.pick.replaceAll('Más', 'Mas');
    for (const m of s.builderMarkets ?? []) {
      m.market = m.market.replaceAll('Más', 'Mas');
      m.pick = m.pick.replaceAll('Más', 'Mas');
    }
  }
  return b;
}

describe('over/under OCR vocabulary agreement', () => {
  it('parses the chosen over separately from the two-alternative market label', () => {
    const rows: [string, number, number][] = [
      ['Betano', 50, 30],
      ['Simple S/10.00', 50, 80],
      ['2.00', 900, 80],
      ['Más de 1.5', 160, 150],
      ['2.00', 900, 150],
      ['Goles totales Más/Menos', 160, 195],
      ['Equipo QA', 160, 240],
      ['Equipo QB', 160, 280],
      ['Apuesta S/10.00', 50, 400],
      ['Ganancias potenciales S/20.00', 50, 450],
    ];
    const lines = rows.map(([text, x, y]) => line(text, x, y));
    const d = parseTicket(lines.map((l) => l.text).join('\n'), lines);
    expect(d.selections).toHaveLength(1);
    expect(d.selections[0]).toMatchObject({
      market: 'Goles totales Más/Menos',
      pick: 'Más de 1.5',
    });
    expect(interpretMarket(d.selections[0].market, d.selections[0].pick)).toMatchObject({
      operator: 'over',
      threshold: 1.5,
      scope: 'match',
    });
  });
  it.each([
    ['Goles totales Más/Menos', 'Más de 1.5'],
    ['Más/Menos goles en primer tiempo', 'Más de 1.5'],
    ['Equipo QA - Goles totales Más/Menos', 'Más de 3.5'],
    ['Goles totales Más/Menos de Equipo QA', 'Más de 0.5'],
    ['Tarjetas Totales Más/Menos', 'Menos de 3.5'],
    ['Remates totales', 'Más de 25.5'],
  ])(
    'accepts only the accent difference for %s / %s and preserves both originals',
    (market, pick) => {
      const a = ticket(market, pick),
        b = withoutAccent(a),
        before = JSON.stringify([a, b]);
      const proof = agreedAutomaticEvidence(a, b, hash);
      expect(proof).toBeDefined();
      expect(verifyAutomaticEvidence({ ...a, automaticEvidence: proof }, hash)).toBe(true);
      expect(verifyAutomaticEvidence({ ...b, automaticEvidence: proof }, hash)).toBe(true);
      expect(JSON.stringify([a, b])).toBe(before);
    },
  );
  it('compares Builder children independently without collapsing their markets or choices', () => {
    const a = ticket('Bet Builder', 'Bet Builder');
    a.selections[0].builderMarkets = [
      { market: 'Goles totales Más/Menos', pick: 'Más de 1.5' },
      { market: 'Tarjetas Totales Más/Menos', pick: 'Menos de 3.5' },
    ];
    const b = withoutAccent(a);
    expect(agreedAutomaticEvidence(a, b, hash)).toBeDefined();
    b.selections[0].builderMarkets!.reverse();
    expect(agreedAutomaticEvidence(a, b, hash)).toBeUndefined();
    b.selections[0].builderMarkets!.pop();
    expect(agreedAutomaticEvidence(a, b, hash)).toBeUndefined();
  });
  it.each([
    [
      'under',
      (d: ParsedTicket) => {
        d.selections[0].pick = 'Menos de 1.5';
      },
    ],
    [
      'threshold',
      (d: ParsedTicket) => {
        d.selections[0].pick = 'Más de 2.5';
      },
    ],
    [
      'period',
      (d: ParsedTicket) => {
        d.selections[0].market += ' en primer tiempo';
      },
    ],
    [
      'scope',
      (d: ParsedTicket) => {
        d.selections[0].market = 'Equipo QA - Goles totales Más/Menos';
      },
    ],
    [
      'statistic',
      (d: ParsedTicket) => {
        d.selections[0].market = 'Tarjetas Totales Más/Menos';
      },
    ],
    [
      'qualifier',
      (d: ParsedTicket) => {
        d.selections[0].market += ' sin prórroga';
      },
    ],
    [
      'odds',
      (d: ParsedTicket) => {
        d.selections[0].odds = 2.1;
      },
    ],
    [
      'missing odds',
      (d: ParsedTicket) => {
        d.selections[0].odds = null;
      },
    ],
    [
      'event',
      (d: ParsedTicket) => {
        d.selections[0].event = 'Equipo QA vs. Equipo QC';
      },
    ],
    [
      'count',
      (d: ParsedTicket) => {
        d.selections.push({ ...d.selections[0] });
      },
    ],
    [
      'stake',
      (d: ParsedTicket) => {
        d.stake = 1100;
      },
    ],
    [
      'placement',
      (d: ParsedTicket) => {
        d.text = d.text.replace('Apuesta aceptada', 'Confirmar apuesta');
      },
    ],
    [
      'cashout offer',
      (d: ParsedTicket) => {
        d.cashoutOffer = 700;
        d.text += '\nCASH OUT S/7.00';
      },
    ],
    [
      'settlement',
      (d: ParsedTicket) => {
        d.text = d.text.replace('Simple S/10.00 2.00', 'Simple S/10.00 Ganada');
      },
    ],
  ])('rejects a changed %s even alongside a harmless accent difference', (_name, change) => {
    const a = ticket(),
      b = withoutAccent(a);
    change(b);
    expect(agreedAutomaticEvidence(a, b, hash)).toBeUndefined();
  });
  it.each([
    [
      'Milán - Goles totales Más/Menos',
      'Más de 1.5',
      'Milán vs. Equipo QB',
      'Milan - Goles totales Mas/Menos',
    ],
    ['José Mas Tiros al arco', 'Más de 1.5', 'Equipo QA vs. Equipo QB', 'Jose Mas Tiros al arco'],
    [
      'Más/Menos FC - Goles totales Más/Menos',
      'Más de 1.5',
      'Más/Menos FC vs. Equipo QB',
      'Mas/Menos FC - Goles totales Más/Menos',
    ],
    [
      'Goles totales Más/Menos de Más/Menos FC',
      'Más de 1.5',
      'Más/Menos FC vs. Equipo QB',
      'Goles totales Más/Menos de Mas/Menos FC',
    ],
  ])('does not fold a participant identity in %s', (market, pick, event, otherMarket) => {
    const a = ticket(market, pick),
      b = ticket(otherMarket, pick);
    a.selections[0].event = b.selections[0].event = event;
    expect(agreedAutomaticEvidence(a, b, hash)).toBeUndefined();
  });
  it.each([
    ['Línea desconocida Más/Menos', 'Más de 1.5'],
    ['Goles totales Más/Menos', 'Más de 1.5 o empate'],
    ['Más/Menos', 'Más de 1.5'],
    ['Goles totales Más/Menos', 'Más/Menos'],
  ])('keeps unrecognized or ambiguous wording literal: %s / %s', (market, pick) => {
    const a = ticket(market, pick);
    expect(agreedAutomaticEvidence(a, withoutAccent(a), hash)).toBeUndefined();
  });
  it('keeps review reasons, image binding and subsequent substantive edits enforced', () => {
    const a = ticket(),
      b = withoutAccent(a),
      proof = agreedAutomaticEvidence(a, b, hash)!;
    expect(proof).toBeDefined();
    b.reviewReasons = ['Participante ambiguo'];
    expect(agreedAutomaticEvidence(a, b, hash)).toBeUndefined();
    a.automaticEvidence = proof;
    expect(verifyAutomaticEvidence(a, 'b'.repeat(64))).toBe(false);
    a.selections[0].pick = 'Menos de 1.5';
    expect(verifyAutomaticEvidence(a, hash)).toBe(false);
  });
  it('keeps accented legacy terms valid and requires fresh agreement for stale unaccented terms', () => {
    const a = ticket(),
      b = withoutAccent(a),
      terms = automaticTerms(a);
    a.automaticEvidence = { version: 'critical-fields-v1', imageHash: hash, terms };
    expect(verifyAutomaticEvidence(a, hash)).toBe(true);
    b.automaticEvidence = { ...a.automaticEvidence, terms: terms.replaceAll('más', 'mas') };
    expect(verifyAutomaticEvidence(b, hash)).toBe(false);
  });
});
