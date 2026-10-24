export type ProductOdds = {
  method: 'product-truncate-2';
  inputs: number[];
  odds: number;
};

// Exact decimal product. Truncate ONCE, after multiplying all outer ticket legs.
// Builder children are already included in their parent leg and are never multiplied again.
export function selectionProduct(
  rows: readonly { odds?: number | null }[],
): ProductOdds | undefined {
  if (rows.length < 2 || rows.length > 100) return undefined;
  let numerator = 1n,
    denominator = 1n;
  const inputs: number[] = [];
  for (const row of rows) {
    const odds = row.odds;
    if (typeof odds !== 'number' || !Number.isFinite(odds) || odds < 1 || odds > 100000)
      return undefined;
    const [integer, decimal = ''] = odds.toString().split('.');
    numerator *= BigInt(integer + decimal);
    denominator *= 10n ** BigInt(decimal.length);
    inputs.push(odds);
  }
  const hundredths = (numerator * 100n) / denominator;
  if (hundredths > 10000000n) return undefined;
  return { method: 'product-truncate-2', inputs, odds: Number(hundredths) / 100 };
}

export function matchesSelectionProduct(
  odds: number | null,
  proof: { method: string; inputs: number[] } | undefined,
  rows: readonly { odds?: number | null }[],
) {
  const result = selectionProduct(rows);
  return (
    !!result &&
    !!proof &&
    proof.method === result.method &&
    odds === result.odds &&
    proof.inputs.length === result.inputs.length &&
    proof.inputs.every((n, i) => n === result.inputs[i])
  );
}
