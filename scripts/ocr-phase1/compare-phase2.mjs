import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const baseline = await read('docs/OCR_PHASE1_BASELINE.json');
const current = await read('test-results/ocr-phase2/report.json');
const unit = await read('test-results/ocr-phase2/unit-tests.json');
const strict = await read('test-results/ocr-phase2-strict/report.json');
assert.equal(current.version, 2);
assert.equal(current.baselineDifferences.length, 0);
assert.equal(current.networkAttempts.length, 0);
assert.equal(unit.numFailedTests, 0);
assert.equal(unit.numPendingTests, 0);
assert.equal(unit.numTodoTests, 0);
assert.equal(current.corpusHash, baseline.corpusHash);
assert.equal(current.packageLockHash, baseline.packageLockHash);
assert.deepEqual(current.assets, baseline.assets);

const changedProductionFiles = [];
for (const [name, hash] of Object.entries(current.productionHashes)) {
  const bytes = await readFile(new URL(name, root));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    hash,
    `${name}: rerun benchmark after editing`,
  );
  if (baseline.productionHashes[name] !== hash) changedProductionFiles.push(name);
}
assert.deepEqual(
  changedProductionFiles.sort(),
  [
    'src/data/captures.ts',
    'src/ocr/betano.ts',
    'src/ocr/markets.ts',
    'src/ocr/parser.ts',
    'src/ocr/semantics.ts',
  ].sort(),
  'Unexpected production changes outside Phase 2 scope',
);

const repairedIds = [
  'unknown-market',
  'unknown-builder-market',
  'missing-odds',
  'injected-unknown-market',
  'injected-missing-odds',
];
const repairComparison = repairedIds.map((id) => {
  const before = [...baseline.cases, ...baseline.controlled].find((r) => r.id === id);
  const after = [...current.results, ...current.probes].find((r) => r.id === id);
  assert.equal(after.quality.failures.length, 0, `${id}: repaired contract failed`);
  assert.equal(after.registered.status, 'review');
  assert.equal(after.registered.bets, 0);
  assert.equal(after.registered.movements, 0);
  assert.equal(after.registered.settlements, 0);
  return {
    id,
    beforeFieldFailures: before.failures.length,
    afterFieldFailures: after.quality.failures.length,
    beforeOmittedLegs: before.omittedLegs ?? (id === 'missing-odds' ? 1 : 0),
    afterOmittedLegs: after.quality.omittedLegs,
    beforeReadPasses: before.reads ?? null,
    afterReadPasses: after.reads ?? null,
    beforeReadMs: before.recognitionMs ?? null,
    afterReadMs: after.recognitionMs ?? null,
    afterRegistration: after.registered,
  };
});
for (const [field, score] of Object.entries(baseline.qualitySummary)) {
  assert.equal(current.qualitySummary[field].total, score.total);
  assert.ok(
    current.qualitySummary[field].correct >= score.correct,
    `${field}: real corpus regression`,
  );
}
const report = {
  version: 2,
  generatedAt: new Date().toISOString(),
  baselineGeneratedAt: baseline.generatedAt,
  measurementGeneratedAt: current.generatedAt,
  environment: current.environment,
  repeats: current.repeats,
  corpusHash: current.corpusHash,
  assetsUnchanged: true,
  dependenciesUnchanged: true,
  productionHashes: current.productionHashes,
  changedProductionFiles,
  historicalSchemasAccountingAndOcrEngineUnchanged: true,
  networkAttempts: current.networkAttempts,
  instrumentationParity: current.instrumentationParity,
  precision: {
    definition:
      'Exact transcription, NFC and whitespace only. No accent forgiveness or semantic relabelling.',
    realImages: 5,
    before: baseline.qualitySummary,
    after: current.qualitySummary,
    remainingLiteralErrors: current.results
      .filter((r) => r.provenance === 'real-capture-deidentified' && r.repeat === 0)
      .flatMap((r) => r.quality.failures.map((f) => ({ id: r.id, ...f }))),
    repairedCases: repairComparison,
    controlledSemanticAttributes:
      'Validated in ocr-phase2.test.ts; no Phase 1 attribute-accuracy baseline exists. Not a real-image NBA accuracy claim.',
  },
  timing: {
    definition:
      'Exclusive milliseconds; same phase boundaries, hardware and models. Registration in fake-indexeddb RAM, not cloud.',
    before: baseline.phaseSummary,
    after: current.phaseSummary,
    fullReadSamples: current.results.map((r) => ({
      id: r.id,
      repeat: r.repeat,
      reads: r.reads,
      ms: r.recognitionMs,
    })),
  },
  unitTests: {
    total: unit.numTotalTests,
    passed: unit.numPassedTests,
    failed: unit.numFailedTests,
    pending: unit.numPendingTests,
    todo: unit.numTodoTests,
  },
  strictLiteralCheck: {
    passed: !strict.results.some((r) => !r.quality.complete),
    remainingFieldErrors: strict.results
      .filter((r) => r.repeat === 0)
      .reduce((sum, r) => sum + r.quality.failures.length, 0),
    unexpectedDifferences: strict.baselineDifferences,
    explanation:
      'Strict matching still fails on four unchanged accent/diaeresis transcriptions. These are not skipped.',
  },
  limitations: [
    'Four literal accent/diaeresis errors remain; strict literal mode must still fail.',
    'Unknown markets are tentative raw labels requiring review, not a verified bookmaker catalog.',
    'Participant type cannot always be inferred without a roster; unknown remains unknown.',
    'Missing odds plus absent/ambiguous block boundaries can still require review of the full OCR text.',
    'NBA coverage is controlled text/layout only; five real fixtures remain football.',
    'No deployment, historical data migration or cloud benchmark was performed.',
  ],
};
await writeFile(
  new URL('docs/OCR_PHASE2_METRICS.json', root),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    { unitTests: report.unitTests, repairs: repairComparison, phaseSummary: current.phaseSummary },
    null,
    2,
  ),
);
