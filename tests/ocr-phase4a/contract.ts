// Test-only admission contract. No production imports, OCR, network or writes.
import { z } from 'zod';

// Validate nonblank text without trimming/replacing the original evidence.
const text = z.string().refine((value) => value.trim().length > 0, 'Nonblank text required');
const cents = z.number().int().nonnegative().nullable();
const odds = z.number().positive().nullable();
const box = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().positive(),
  z.number().int().positive(),
]); // x, y, width, height in the reviewed PNG

export const meaningSchema = z.strictObject({
  statistic: text.nullable(),
  scope: z.enum(['match', 'team', 'player', 'unknown']),
  participant: text.nullable(),
  period: z.enum([
    'unspecified',
    'first-half',
    'second-half',
    'first-period',
    'second-period',
    'third-period',
    'fourth-period',
    'full-match',
  ]),
});
const market = z.strictObject({
  market: text.nullable(),
  pick: text.nullable(),
  odds,
  meaning: meaningSchema,
});
const expected = z.strictObject({
  house: z.literal('Betano'),
  kind: z.enum(['Simple', 'Combinada']).nullable(),
  stake: cents,
  odds,
  potential: cents,
  placement: z.enum(['preparation', 'confirmed', 'unknown']),
  settlement: z.enum(['unknown', 'Pendiente', 'Ganada', 'Perdida', 'Cashout']),
  cashoutKind: z.enum(['none', 'offer', 'executed']),
  cashoutOffer: cents,
  settledReturn: cents,
  selections: z
    .array(
      z.strictObject({
        event: text.nullable(),
        sport: text.nullable(),
        league: text.nullable(),
        market: text.nullable(),
        pick: text.nullable(),
        odds,
        meaning: meaningSchema.nullable(),
        builderMarkets: z.array(market),
      }),
    )
    .min(1),
});

export const captureSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]+$/),
    category: z.enum(['football', 'nba', 'bet-builder', 'cashout', 'settled']),
    tags: z.array(text).min(1),
    image: z
      .string()
      .regex(/^images\/(football|nba|bet-builder|cashout|settled)\/[a-z][a-z0-9-]+\.png$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    provenance: z.literal('real-capture-deidentified'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    review: z.strictObject({
      publicationAuthorized: z.literal(true),
      privacyChecked: z.literal(true),
      visualChecked: z.literal(true),
      independentAnnotation: z.literal(true),
      reviewedOn: z.iso.date(),
      authorizationRef: text, // opaque reference; never a name, ticket ID or private path
    }),
    redactions: z.array(
      z.strictObject({ box, reason: z.enum(['account', 'ticket-id', 'qr', 'notification']) }),
    ),
    transcript: text, // verbatim visible text, manually read; not generated from OCR
    expected,
    evidence: z
      .array(
        z.strictObject({
          field: text, // leaf path under expected, e.g. selections[0].market
          box: box.nullable(),
          observation: text, // visible wording or explicit explanation of absence/ambiguity
        }),
      )
      .min(1),
  })
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (c.image !== `images/${c.category}/${c.id}.png`) fail('Image/category/id mismatch');
    const fields = new Map(c.evidence.map((e) => [e.field, e]));
    if (fields.size !== c.evidence.length) fail('Duplicate evidence field');
    const leaves = new Map<string, unknown>();
    function visit(value: unknown, at: string) {
      if (Array.isArray(value)) {
        if (!value.length) leaves.set(at, value);
        value.forEach((v, i) => visit(v, `${at}[${i}]`));
      } else if (value !== null && typeof value === 'object') {
        Object.entries(value).forEach(([key, v]) => visit(v, at ? `${at}.${key}` : key));
      } else leaves.set(at, value);
    }
    visit(c.expected, '');
    for (const [field, value] of leaves) {
      const e = fields.get(field);
      if (!e) fail(`Missing evidence: ${field}`);
      else if (
        value !== null &&
        !['unknown', 'unspecified', 'none'].includes(String(value)) &&
        !Array.isArray(value) &&
        !e.box
      )
        fail(`Visible evidence needs a region: ${field}`);
    }
    for (const field of fields.keys())
      if (!leaves.has(field)) fail(`Unknown evidence field: ${field}`);
    for (const b of [
      ...c.redactions.map((r) => r.box),
      ...c.evidence.flatMap((e) => (e.box ? [e.box] : [])),
    ]) {
      if (b[0] + b[2] > c.width || b[1] + b[3] > c.height) fail('Region outside image');
    }
    const e = c.expected;
    if (e.cashoutOffer !== null && e.cashoutKind !== 'offer')
      fail('Offer amount requires offer evidence');
    if ((e.cashoutKind === 'executed') !== (e.settlement === 'Cashout'))
      fail('Executed cashout needs settlement evidence');
    if (['unknown', 'Pendiente'].includes(e.settlement) && e.settledReturn !== null)
      fail('Unsettled ticket cannot have realized return');
    for (const s of e.selections) {
      if (s.builderMarkets.length ? s.meaning !== null : s.meaning === null)
        fail('Annotate Builder children or a single market, never both');
    }
  });

export const manifestSchema = z
  .strictObject({
    version: z.literal('4A'),
    annotation: text,
    cases: z.array(captureSchema),
  })
  .superRefine((m, ctx) => {
    for (const field of ['id', 'image', 'sha256'] as const) {
      if (new Set(m.cases.map((c) => c[field])).size !== m.cases.length)
        ctx.addIssue({ code: 'custom', message: `Duplicate ${field}` });
    }
  });

// Human semantics remain independent from production interpretation. Exact fields
// deliberately expose unresolved identities; no allowlist or accent folding.
export function meaningDifferences(expected: z.infer<typeof meaningSchema>, actual: unknown) {
  const got = actual as Record<string, unknown> | null | undefined;
  return (Object.keys(expected) as (keyof typeof expected)[]).filter(
    (key) => expected[key] !== got?.[key],
  );
}
