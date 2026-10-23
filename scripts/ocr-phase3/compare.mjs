import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const beforePath =
  process.argv[2] ?? 'test-results/phase3-base/test-results/ocr-phase3/report.json';
const afterPath = process.argv[3] ?? 'test-results/ocr-phase3/report.json';
const before = await read(beforePath),
  after = await read(afterPath);
const semanticGold = await read('tests/ocr-phase3/semantics.json');
const corpus = [
  ...(await read('tests/ocr-phase1/cases.json')).cases,
  ...(await read('tests/ocr-phase3/cases.json')).cases,
];
assert.equal(
  before.corpusHash,
  after.corpusHash,
  'Comparison requires the same images and expected data',
);
assert.deepEqual(before.assets, after.assets);
// git archive uses LF; the Windows checkout uses CRLF. Verify bytes against
// each recorded hash, then compare canonical text without masking changes.
const locks = await Promise.all(
  [beforePath, afterPath].map((p) =>
    readFile(path.resolve(path.dirname(p), '../..', 'package-lock.json'), 'utf8'),
  ),
);
for (const [i, r] of [before, after].entries())
  assert.equal(createHash('sha256').update(locks[i]).digest('hex'), r.packageLockHash);
assert.equal(locks[0].replaceAll('\r\n', '\n'), locks[1].replaceAll('\r\n', '\n'));
const once = (r) =>
  r.results.filter((x) => x.repeat === 0 && x.provenance === 'real-capture-deidentified');
const percentile = (ns, q) =>
  [...ns].sort((a, b) => a - b)[Math.max(0, Math.ceil(ns.length * q) - 1)];
const score = (checks) =>
  Object.fromEntries(
    [...new Set(checks.map((c) => c.field))].map((field) => {
      const values = checks.filter((c) => c.field === field);
      return [
        field,
        {
          correct: values.filter((c) => c.correct).length,
          total: values.length,
          unknown: values.filter((c) => c.actual == null || c.actual === 'unknown').length,
        },
      ];
    }),
  );
function semantic(result) {
  const expected = semanticGold.cases[result.id],
    checks = [];
  const add = (field, path, e, a, confidence) =>
    checks.push({
      field,
      path,
      expected: e,
      actual: a ?? null,
      correct: e === a,
      ...(confidence ? { confidence } : {}),
    });
  for (const row of expected.attributes) {
    const got = result.parsed.interpretations.find((i) => i.path === row.path)?.value;
    for (const field of ['statistic', 'scope']) add(field, row.path, row[field], got?.[field]);
    if (row.participant !== null)
      add('participant', row.path, row.participant, got?.participant, got?.confidence.participant);
    if (row.period !== 'unspecified') add('explicitPeriod', row.path, row.period, got?.period);
    else add('periodAbstention', row.path, 'unspecified', got?.period);
  }
  add('placement', 'ticket', expected.placement, result.parsed.placement?.status);
  // Absence of a ticket-level settlement label is unknown, never automatically "Pendiente".
  add(
    'settlementAbstention',
    'ticket',
    expected.settlement,
    result.parsed.visibleStatus ?? 'unknown',
  );
  return { fields: score(checks), checks, failures: checks.filter((c) => !c.correct) };
}
function summarize(report) {
  const first = once(report),
    sem = first.flatMap((r) => semantic(r).checks);
  const groups = {
    simple: (c) => c.expected.kind === 'Simple',
    combined: (c) => c.expected.kind === 'Combinada',
    withBuilder: (c) => c.expected.selections.some((s) => s.builderMarkets?.length),
    liveVisible: (c) => c.id === 'timed-goal',
    placementConfirmed: (c) => semanticGold.cases[c.id].placement === 'confirmed',
    placementUnknown: (c) => semanticGold.cases[c.id].placement === 'unknown',
  };
  return {
    images: first.length,
    timingSamples: first.length * report.repeats,
    repeats: report.repeats,
    rawFields: report.qualitySummary,
    semanticFields: score(sem),
    participantCorrectAndRecognized: sem.filter(
      (c) => c.field === 'participant' && c.correct && c.confidence === 'recognized',
    ).length,
    phases: report.phaseSummary,
    environment: report.environment,
    saved: first.filter((r) => r.registered.status === 'saved').length,
    review: first.filter((r) => r.registered.status === 'review').length,
    rawFieldFailures: first.flatMap((r) => r.quality.failures.map((f) => ({ id: r.id, ...f }))),
    semanticFailures: first.flatMap((r) => semantic(r).failures.map((f) => ({ id: r.id, ...f }))),
    byCaptureType: Object.fromEntries(
      Object.entries(groups).map(([name, matches]) => {
        const rows = first.filter((r) => matches(corpus.find((c) => c.id === r.id)));
        const fields = {};
        for (const r of rows)
          for (const [field, values] of Object.entries(r.quality.fields)) {
            fields[field] ??= { correct: 0, total: 0, missing: 0, wrong: 0 };
            for (const key of Object.keys(values)) fields[field][key] += values[key];
          }
        return [
          name,
          {
            images: rows.length,
            rawFields: fields,
            semanticFields: score(rows.flatMap((r) => semantic(r).checks)),
            note: 'Overlapping subset; do not add groups to enlarge sample.',
          },
        ];
      }),
    ),
    byCapture: first.map((r) => {
      const samples = report.results.filter((x) => x.id === r.id);
      return {
        id: r.id,
        tags: corpus.find((c) => c.id === r.id).tags,
        kind: r.parsed.kind,
        outerLegs: r.parsed.selections.length,
        semanticSelections: semanticGold.cases[r.id].attributes.length,
        rawFields: r.quality.fields,
        semanticFields: semantic(r).fields,
        registration: r.registered,
        recognition: {
          samples: samples.length,
          p50Ms: percentile(
            samples.map((s) => s.recognitionMs),
            0.5,
          ),
          p95Ms: percentile(
            samples.map((s) => s.recognitionMs),
            0.95,
          ),
          passes: samples.map((s) => s.reads),
        },
        phases: Object.fromEntries(
          Object.keys(r.metrics).map((phase) => [
            phase,
            {
              p50Ms: percentile(
                samples.map((s) => s.metrics[phase].ms),
                0.5,
              ),
              p95Ms: percentile(
                samples.map((s) => s.metrics[phase].ms),
                0.95,
              ),
            },
          ]),
        ),
      };
    }),
    externalNetworkAttempts: report.networkAttempts,
    instrumentationParity: report.instrumentationParity,
    unexpectedBaselineDifferences: report.baselineDifferences,
  };
}
const metrics = {
  version: 3,
  generatedAt: new Date().toISOString(),
  baseCommit: 'd54d5eb52651da13809e9c623fac054ad01a402a',
  corpusHash: after.corpusHash,
  sample: {
    uniqueRealImages: 7,
    newImages: 2,
    sport: 'football only',
    simple: 1,
    combined: 6,
    withBuilders: 4,
    outerLegs: 33,
    semanticSelections: 57,
    placementConfirmedByCashoutOffer: 6,
    placementUnknown: 1,
    explicitSettlementLabels: 0,
    realPreparation: 0,
    realNBA: 0,
    realExecutedCashout: 0,
    note: 'Preparation, settlement and NBA behavior have synthetic regression tests only. Seven distinct images; timing repeats do not enlarge precision sample.',
  },
  before: summarize(before),
  after: summarize(after),
  limitations: [
    'Literal comparisons retain accents/case; no relaxed matching to inflate accuracy.',
    'Semantic gold is a separate human annotation, not generated by interpretMarket.',
    'Participant text extraction differs from identity confidence; report both.',
    'Unspecified periods and unknown settlement are abstention checks, excluded from explicit-period/settlement precision.',
    'Timing is local Chromium, one OCR worker, RAM registration. No cloud latency, batch-throughput claim or production synchronization test.',
    'Small samples and sequential runs; no statistical significance claimed. Existing phase timing boundaries are exclusive mixed-function measurements.',
  ],
};
await writeFile('docs/OCR_PHASE3_METRICS.json', JSON.stringify(metrics, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      before: metrics.before.rawFields,
      after: metrics.after.rawFields,
      semantic: metrics.after.semanticFields,
    },
    null,
    2,
  ),
);
