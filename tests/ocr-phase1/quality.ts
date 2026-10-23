// Evaluation only. Never imported by application code or used to repair OCR.
import type { ParsedTicket } from '../../src/ocr/parser';

export type ExpectedLeg = {
  event: string;
  market: string;
  pick: string;
  odds: number | null;
  promotion?: string;
  builderMarkets?: { market: string; pick: string; promotion?: string }[];
};
export type ExpectedTicket = {
  house: string;
  kind: string;
  stake: number;
  odds: number;
  potential: number;
  cashoutOffer?: number;
  selections: ExpectedLeg[];
};
export type Check = {
  field: string;
  path: string;
  expected: unknown;
  actual: unknown;
  exact: boolean;
  correct: boolean;
  status: 'correct' | 'missing' | 'wrong';
};
// Only Unicode canonical composition and whitespace are equivalent. Accents,
// digits, signs, names, periods and shot/goal qualifiers remain significant.
const normalize = (v: unknown) =>
  typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : v;

export function evaluate(expected: ExpectedTicket, actual: ParsedTicket) {
  const checks: Check[] = [];
  const add = (field: string, path: string, e: unknown, a: unknown) => {
    const correct = normalize(e) === normalize(a);
    checks.push({
      field,
      path,
      expected: e,
      actual: a ?? null,
      exact: e === a,
      correct,
      status: correct ? 'correct' : a === undefined || a === null || a === '' ? 'missing' : 'wrong',
    });
  };
  for (const field of ['house', 'kind', 'stake', 'odds', 'potential'] as const)
    add(field, field, expected[field], actual[field]);
  add('count', 'selections.length', expected.selections.length, actual.selections.length);
  if (expected.cashoutOffer !== undefined)
    add('cashoutOffer', 'cashoutOffer', expected.cashoutOffer, actual.cashoutOffer);
  expected.selections.forEach((leg, i) => {
    const got = actual.selections[i];
    const path = `selections[${i}]`;
    for (const field of ['event', 'market', 'pick'] as const)
      add(field, `${path}.${field}`, leg[field], got?.[field]);
    add('legOdds', `${path}.odds`, leg.odds, got?.odds);
    if (leg.promotion) add('promotion', `${path}.promotion`, leg.promotion, got?.promotion);
    add(
      'count',
      `${path}.builderMarkets.length`,
      leg.builderMarkets?.length ?? 0,
      got?.builderMarkets?.length ?? 0,
    );
    leg.builderMarkets?.forEach((child, j) => {
      for (const field of ['market', 'pick'] as const)
        add(
          field,
          `${path}.builderMarkets[${j}].${field}`,
          child[field],
          got?.builderMarkets?.[j]?.[field],
        );
      if (child.promotion)
        add(
          'promotion',
          `${path}.builderMarkets[${j}].promotion`,
          child.promotion,
          got?.builderMarkets?.[j]?.promotion,
        );
    });
  });
  const fields = Object.fromEntries(
    [...new Set(checks.map((c) => c.field))].map((field) => {
      const subset = checks.filter((c) => c.field === field);
      return [
        field,
        {
          correct: subset.filter((c) => c.correct).length,
          total: subset.length,
          missing: subset.filter((c) => c.status === 'missing').length,
          wrong: subset.filter((c) => c.status === 'wrong').length,
        },
      ];
    }),
  );
  return {
    checks,
    fields,
    failures: checks.filter((c) => !c.correct),
    complete: checks.every((c) => c.correct),
    omittedLegs: Math.max(0, expected.selections.length - actual.selections.length),
    extraLegs: Math.max(0, actual.selections.length - expected.selections.length),
  };
}

export function failureSignatures(result: ReturnType<typeof evaluate>) {
  return result.failures.map((c) => `${c.path}:${c.status}`).sort();
}
