import { describe, expect, it } from 'vitest';
import { betanoHeader } from '../ocr/header';
import { findSymbols } from '../ocr/symbols';
import { parseTicket } from '../ocr/parser';
import type { OcrLine } from '../ocr/layout';

const row = (text: string, y: number, x = 160): OcrLine => {
  let cursor = x;
  const words = text.split(' ').map((text) => {
    const x0 = cursor;
    cursor += text.length * 7 + 7;
    return { text, confidence: 95, bbox: { x0, x1: cursor - 7, y0: y, y1: y + 20 } };
  });
  return { text, confidence: 95, bbox: { x0: x, x1: cursor, y0: y, y1: y + 20 }, words };
};

describe('Header aliases count outer events, not Builder children', () => {
  it.each([
    ['Doble', 2],
    ['Triple', 3],
  ] as const)('reads %s as Combinada of %i', (label, count) => {
    const lines = [row('Betano', 10), row(`${label} S/5.00`, 70), row('3.00', 73, 900)];
    for (let i = 0; i < count; i++) {
      const y = 150 + i * 140;
      lines.push(
        row('Equipo Norte', y),
        row('1.50', y, 900),
        row('Resultado del partido', y + 35),
        row('Equipo Norte', y + 70),
        row('Equipo Sur', y + 105),
      );
    }
    lines.push(
      row('Apuesta', 800),
      row('S/5.00', 800, 900),
      row('Ganancias potenciales', 850),
      row('S/15.00', 850, 900),
    );
    const p = parseTicket('', lines);
    expect(p).toMatchObject({
      kind: 'Combinada',
      expectedSelections: count,
      stake: 500,
      odds: 3,
      potential: 1500,
    });
    expect(p.selections).toHaveLength(count);
    expect(p.selections.every((s) => s.event === 'Equipo Norte vs. Equipo Sur')).toBe(true);
  });
  it.each(['Doble oportunidad', 'Triple doble', 'Triples', 'Simple FC'])(
    'does not turn %s into a header',
    (value) => {
      expect(betanoHeader(value)).toBeUndefined();
    },
  );
  it('reports a missing third leg instead of accepting an incomplete Triple', () => {
    const p = parseTicket(
      'Betano\nTriple S/5.00 3.00\nApuesta S/5.00\nGanancias potenciales S/15.00',
    );
    expect(p.expectedSelections).toBe(3);
    expect(p.warnings.some((w) => w.includes('indica 3'))).toBe(true);
  });
  it('keeps a Simple with Doble oportunidad simple', () => {
    const p = parseTicket('Betano\nSimple S/5.00 1.50\nDoble oportunidad\nApuesta S/5.00');
    expect(p.kind).toBe('Simple');
    expect(p.expectedSelections).toBe(1);
  });
});

describe('Color badges are not executed results', () => {
  it('masks a compact green check without assigning payment or promotion', () => {
    const width = 240,
      height = 120;
    const data = new Uint8ClampedArray(width * height * 4);
    for (const [x, color] of [
      [30, [20, 200, 80]],
      [100, [40, 200, 190]],
      [170, [240, 210, 30]],
    ] as const) {
      for (let y = 30; y < 57; y++)
        for (let dx = x; dx < x + 27; dx++) data.set([...color, 255], (y * width + dx) * 4);
    }
    const symbols = findSymbols({ data, width, height, colorSpace: 'srgb' } as ImageData);
    expect(symbols).toHaveLength(3);
    expect(symbols[0].promotion).toBeUndefined();
    expect(symbols[1].promotion).toBe('Pago anticipado +2');
    expect(symbols[2].promotion).toBe('Suplente de Oro');
    const p = parseTicket('Betano\nSimple S/5.00 1.50', [], symbols);
    expect(p.visibleStatus).toBeUndefined();
    expect(p).not.toHaveProperty('settlements');
  });
});
