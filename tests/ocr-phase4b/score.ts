// FASE 4B: comparison only. Human-reviewed annotations are immutable.
// This module never performs OCR, writes bets, or infers absent bookmaker evidence.
import type { ParsedTicket } from '../../src/ocr/parser';

export type Phase4BOracle = {
  house: string;
  kind: 'Simple' | 'Combinada' | null;
  stake: number | null; // integer cents
  odds: number | null;
  potential: number | null; // integer cents
  placement: 'preparation' | 'confirmed' | 'unknown';
  settlement: 'unknown' | 'Pendiente' | 'Ganada' | 'Perdida' | 'Cashout';
  cashoutKind: 'none' | 'offer' | 'executed';
  cashoutOffer: number | null; // integer cents
  settledReturn: number | null;
  selections: {
    event: string | null;
    sport: string | null;
    league: string | null;
    market: string | null;
    pick: string | null;
    odds: number | null;
    meaning: {
      statistic: string | null;
      scope: 'match' | 'team' | 'player' | 'unknown';
      participant: string | null;
      period: string;
    } | null;
    builderMarkets: {
      market: string | null;
      pick: string | null;
      odds: number | null;
      meaning: {
        statistic: string | null;
        scope: 'match' | 'team' | 'player' | 'unknown';
        participant: string | null;
        period: string;
      };
    }[];
  }[];
};

export type Phase4BCheck = {
  field: string;
  path: string;
  expected: unknown;
  actual: unknown;
  correct: boolean;
  status: 'correct' | 'missing' | 'wrong';
};

// Canonical composition and whitespace are equivalent for labels only. Do not
// fold accents, case, players, teams, line thresholds or betting periods.
function canonical(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value.normalize('NFC').replace(/\s+/g, ' ').trim();
  return value;
}

function settlementShown(status?: string) {
  const literal = status?.normalize('NFC').trim().toLowerCase();
  if (literal === 'ganada') return 'Ganada';
  if (literal === 'perdida') return 'Perdida';
  if (literal === 'pendiente') return 'Pendiente';
  if (literal === 'cash out ejecutado' || literal === 'cash out realizado' || literal === 'cash out cobrado')
    return 'Cashout';
  return 'unknown';
}

export function evaluatePhase4B(expected: Phase4BOracle, actual: ParsedTicket) {
  const checks: Phase4BCheck[] = [];
  function add(field: string, path: string, target: unknown, received: unknown) {
    const a = canonical(received), e = canonical(target);
    const correct = Object.is(e, a);
    checks.push({
      field, path, expected: target, actual: received ?? null, correct,
      status: correct ? 'correct' : a === null ? 'missing' : 'wrong',
    });
  }
  for (const field of ['house', 'kind', 'stake', 'odds', 'potential'] as const)
    add(field, field, expected[field], actual[field]);
  add('placement', 'placement', expected.placement, actual.placement?.status);
  const actualSettlement = settlementShown(actual.visibleStatus);
  add('settlement', 'settlement', expected.settlement, actualSettlement);
  const actualCashoutKind = actualSettlement === 'Cashout'
    ? 'executed'
    : actual.cashoutOffer !== undefined ? 'offer' : 'none';
  add('cashoutKind', 'cashoutKind', expected.cashoutKind, actualCashoutKind);
  add('cashoutOffer', 'cashoutOffer', expected.cashoutOffer, actual.cashoutOffer);
  // The production OCR does not expose a settledReturn field. Report coverage
  // honestly rather than inventing zero or marking unsupported as correctly read.
  const unsupportedFields = ['settledReturn'];
  add('selectionCount', 'selections.length', expected.selections.length, actual.selections.length);
  expected.selections.forEach((e, i) => {
    const a = actual.selections[i], path = 'selections[' + i + ']';
    for (const field of ['event', 'sport', 'league', 'market', 'pick', 'odds'] as const)
      add(field === 'odds' ? 'legOdds' : field, path + '.' + field, e[field], a?.[field]);
    add('builderCount', path + '.builderMarkets.length',
      e.builderMarkets.length, a?.builderMarkets?.length ?? 0);
    if (e.meaning) {
      const interpretation = actual.interpretations?.find((v) => v.path === path)?.value;
      for (const field of ['statistic', 'scope', 'participant', 'period'] as const)
        add('meaning.' + field, path + '.meaning.' + field, e.meaning[field], interpretation?.[field]);
    }
    e.builderMarkets.forEach((child, j) => {
      const cp = path + '.builderMarkets[' + j + ']';
      const observed = a?.builderMarkets?.[j];
      for (const field of ['market', 'pick'] as const)
        add('builder.' + field, cp + '.' + field, child[field], observed?.[field]);
      // Production Builder children have no per-child odds field. The reviewed
      // corpus currently stores null for each; do not score an unexposed field.
      const interpretation = actual.interpretations?.find((v) => v.path === cp)?.value;
      for (const field of ['statistic', 'scope', 'participant', 'period'] as const)
        add('meaning.' + field, cp + '.meaning.' + field,
          child.meaning[field], interpretation?.[field]);
    });
  });
  const fields: Record<string, { correct: number; total: number; missing: number; wrong: number }> = {};
  for (const c of checks) {
    const totals = fields[c.field] ??= { correct: 0, total: 0, missing: 0, wrong: 0 };
    totals.total++;
    if (c.status === 'correct') totals.correct++;
    else totals[c.status]++;
  }
  const unsupportedConfirmation =
    expected.placement !== 'confirmed' && actual.placement?.status === 'confirmed';
  const unsupportedWin = expected.settlement !== 'Ganada' && actualSettlement === 'Ganada';
  const unsupportedExecutedCashout =
    expected.cashoutKind !== 'executed' && actualCashoutKind === 'executed';
  return {
    fields, checks, failures: checks.filter((check) => !check.correct),
    complete: checks.every((check) => check.correct),
    omittedSelections: Math.max(0, expected.selections.length - actual.selections.length),
    extraSelections: Math.max(0, actual.selections.length - expected.selections.length),
    unsupportedFields,
    safety: { unsupportedConfirmation, unsupportedWin, unsupportedExecutedCashout },
  };
}
