import { describe, it, expect } from 'vitest';
import trace from '../../tests/ocr-phase3/eleven-builders.ocr.json';
import corpus from '../../tests/ocr-phase3/cases.json';
import { parseTicket } from '../ocr/parser';
import type { SymbolCandidate } from '../ocr/symbols';
describe('Real Betano OCR trace: child bullet read as copyright glyph', () => {
  it('retains exactly eleven events and both children of the last builder', () => {
    const p = parseTicket(trace.text, trace.lines, trace.symbols as SymbolCandidate[]);
    expect(p.selections).toHaveLength(11);
    expect(p.selections[10]).toMatchObject(corpus.cases[1].expected.selections[10]);
    expect(p.selections.every((s) => s.odds !== null)).toBe(true);
    expect(p.reviewReasons).toEqual([]);
  });
});
