import { it, expect } from 'vitest';
import { selectionProduct, matchesSelectionProduct } from '../domain/odds';
it.each([
  [[2.02, 2.15, 1.36], 5.9],
  [[1.1, 1.1], 1.21],
  [[1.999, 1.999], 3.99],
  [[1.999, 1.01, 1.01], 2.03],
  [[1.23, 1.01], 1.24],
  [[1, 1], 1],
] as const)(
  'multiplies %j exactly and truncates only the final product to %s',
  (inputs, expected) => {
    const result = selectionProduct(inputs.map((odds) => ({ odds })));
    expect(result?.odds).toBe(expected);
    expect(result?.odds.toFixed(2)).toBe(expected.toFixed(2));
    expect(result?.inputs).toEqual(inputs);
  },
);
it.each([
  [2, null],
  [2, undefined],
  [2, NaN],
  [2, Infinity],
  [0, 2],
  [100001, 2],
  [100000, 100000],
  [2],
  [],
])('does not invent a total from %j', (...input) => {
  expect(selectionProduct(input.map((odds) => ({ odds })))).toBeUndefined();
});
it('counts each outer Bet Builder leg once and detects changed inputs', () => {
  const rows = [
    {
      odds: 2,
      builderMarkets: [
        { market: 'Goles', pick: 'Más de 1.5' },
        { market: 'Corners', pick: 'Más de 4.5' },
      ],
    },
    { odds: 3 },
  ];
  const result = selectionProduct(rows)!;
  expect(result.odds).toBe(6);
  expect(result.inputs).toEqual([2, 3]);
  expect(matchesSelectionProduct(6, result, rows)).toBe(true);
  expect(matchesSelectionProduct(6, result, [{ odds: 2.1 }, { odds: 3 }])).toBe(false);
  expect(matchesSelectionProduct(6.01, result, rows)).toBe(false);
});
