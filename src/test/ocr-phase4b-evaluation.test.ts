// Synthetic scorer-only controls. No OCR, networking, cloud or registrations.
import { describe, expect, it } from 'vitest';
import type { ParsedTicket } from '../ocr/parser';
import { evaluatePhase4B, type Phase4BOracle } from '../../tests/ocr-phase4b/score';

function pair(): { expected: Phase4BOracle; actual: ParsedTicket } {
  return {
    expected: {
      house: 'Betano', kind: 'Simple', stake: 1000, odds: 2.5, potential: 2500,
      placement: 'unknown', settlement: 'unknown', cashoutKind: 'none',
      cashoutOffer: null, settledReturn: null,
      selections: [{
        event: 'Equipo A vs. Equipo B', sport: null, league: null,
        market: 'Goles totales Más/Menos', pick: 'Más de 1.5', odds: 2.5,
        meaning: { statistic: 'goals', scope: 'match', participant: null, period: 'unspecified' },
        builderMarkets: [],
      }],
    },
    actual: {
      house: 'Betano', kind: 'Simple', stake: 1000, odds: 2.5, potential: 2500,
      placement: { status: 'unknown', basis: 'insufficient', evidence: [] },
      selections: [{
        event: 'Equipo A vs. Equipo B', sport: '', league: '',
        market: 'Goles totales Más/Menos', pick: 'Más de 1.5', odds: 2.5,
      }],
      interpretations: [{
        path: 'selections[0]',
        value: {
          original: { market: 'Goles totales Más/Menos', pick: 'Más de 1.5', event: 'Equipo A vs. Equipo B' },
          family: 'goals', sport: null, statistic: 'goals', scope: 'match', participant: null,
          period: 'unspecified', operator: 'over', threshold: 1.5,
          confidence: { market: 'recognized', sport: 'missing', participant: 'missing',
            scope: 'recognized', period: 'missing', selection: 'recognized' },
        },
      }],
      warnings: [], confidence: {}, text: '',
    },
  };
}

describe('FASE 4B scorer: explicit evidence without financial inference', () => {
  it('correctly compares a synthetic ticket and never claims settledReturn OCR coverage', () => {
    const { expected, actual } = pair();
    const result = evaluatePhase4B(expected, actual);
    expect(result.complete).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.unsupportedFields).toContain('settledReturn');
    expect(result.omittedSelections).toBe(0);
    expect(result.extraSelections).toBe(0);
  });
  it('does not fold accents, periods, participant identity or money', () => {
    const { expected, actual } = pair();
    expected.selections[0].pick = 'Sí';
    actual.selections[0].pick = 'Si';
    expected.selections[0].meaning!.period = 'first-half';
    expected.selections[0].meaning!.participant = 'Iván';
    actual.interpretations![0].value.participant = 'Ivan';
    actual.stake = 0;
    const failed = evaluatePhase4B(expected, actual).failures.map((c) => c.path);
    expect(failed).toContain('stake');
    expect(failed).toContain('selections[0].pick');
    expect(failed).toContain('selections[0].meaning.participant');
    expect(failed).toContain('selections[0].meaning.period');
  });
  it('detects premature placement, win and executed cashout assertions', () => {
    const { expected, actual } = pair();
    actual.placement = { status: 'confirmed', basis: 'cashout-available', evidence: [] };
    actual.visibleStatus = 'Ganada';
    actual.cashoutOffer = 1000;
    const result = evaluatePhase4B(expected, actual);
    expect(result.safety.unsupportedConfirmation).toBe(true);
    expect(result.safety.unsupportedWin).toBe(true);
    expect(result.safety.unsupportedExecutedCashout).toBe(false);
    expect(result.failures.map((c) => c.path)).toContain('cashoutKind');
    actual.visibleStatus = 'cash out ejecutado';
    expect(evaluatePhase4B(expected, actual).safety.unsupportedExecutedCashout).toBe(true);
  });
  it('flags missing Builder children and extra parsed events; no phantom events in oracle', () => {
    const { expected, actual } = pair();
    expected.selections[0].market = 'Bet Builder';
    expected.selections[0].pick = 'Bet Builder';
    expected.selections[0].meaning = null;
    expected.selections[0].builderMarkets = [{
      market: 'Córners totales', pick: 'Más de 8.5', odds: null,
      meaning: { statistic: 'corners', scope: 'match', participant: null, period: 'unspecified' },
    }];
    const first = evaluatePhase4B(expected, actual);
    expect(first.failures.map((c) => c.path)).toContain('selections[0].builderMarkets.length');
    expect(first.failures.map((c) => c.path)).toContain('selections[0].builderMarkets[0].market');
    actual.selections.push({ ...actual.selections[0], event: 'Evento duplicado' });
    const extra = evaluatePhase4B(expected, actual);
    expect(extra.extraSelections).toBe(1);
    expect(extra.failures.map((c) => c.path)).toContain('selections.length');
  });
  it('handles a future bet365 Superaumento oracle without inheriting placement from a cashout label', () => {
    const { expected, actual } = pair();
    // Synthetic comparison only: not a new admitted or verified Flamengo PNG.
    expected.house = 'Bet365';
    expected.cashoutKind = 'offer';
    expected.cashoutOffer = 2500;
    actual.house = 'Bet365';
    actual.cashoutOffer = 2500;
    const result = evaluatePhase4B(expected, actual);
    expect(result.complete).toBe(true);
    expect(result.safety.unsupportedExecutedCashout).toBe(false);
    expect(result.safety.unsupportedConfirmation).toBe(false);
    expect(actual.placement?.status).toBe('unknown');
  });
  it('keeps absent cashout distinct from a visible offer; neither means collected money', () => {
    const { expected, actual } = pair();
    expected.cashoutKind = 'offer';
    expected.cashoutOffer = 0;
    const missing = evaluatePhase4B(expected, actual);
    expect(missing.failures.map((c) => c.path)).toContain('cashoutOffer');
    actual.cashoutOffer = 0;
    const offered = evaluatePhase4B(expected, actual);
    expect(offered.fields.cashoutOffer.correct).toBe(1);
    expect(offered.safety.unsupportedExecutedCashout).toBe(false);
  });
});
