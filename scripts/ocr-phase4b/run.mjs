// FASE 4B — isolated, read-only OCR audit on 4A's 28 reviewed real PNGs.
// No Supabase, registration, migrations, cloud E2E, uploads or deployment.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { auditPlugin } from '../ocr-phase1/instrumentation.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const corpusRoot = path.join(root, 'tests/ocr-phase4a');
const corpus = JSON.parse(await readFile(path.join(corpusRoot, 'cases.json'), 'utf8'));
const admission = JSON.parse(await readFile(path.join(corpusRoot, 'admission.json'), 'utf8'));
const assetLock = JSON.parse(await readFile(path.join(root, 'tests/ocr-phase1/assets.lock.json'), 'utf8'));
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const repeats = Number(process.env.OCR_REPEATS ?? 1);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 5, 'OCR_REPEATS must be 1..5');
const strict = process.argv.includes('--strict');
const selected = process.env.OCR_CASE_IDS?.split(',').map((s) => s.trim()).filter(Boolean);
assert(corpus.version === '4A', 'Only the reviewed 4A corpus may be measured');
assert(corpus.cases.length === admission.counts.admitted, 'Admission case count mismatch');
const knownIDs = new Set(corpus.cases.map((c) => c.id));
if (selected?.length) {
  assert.equal(selected.length, new Set(selected).size, 'Duplicate OCR_CASE_IDS');
  for (const id of selected) assert(knownIDs.has(id), 'Unknown or unadmitted case: ' + id);
}
const cases = selected?.length
  ? corpus.cases.filter((c) => selected.includes(c.id))
  : corpus.cases;
assert(cases.length > 0, 'At least one admitted case required');

const protectedPaths = ['src/ocr', 'src/data', 'src/domain', 'supabase/migrations'];
async function treeHashes(relative) {
  const result = {};
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = relative + '/' + entry.name;
    if (entry.isDirectory()) Object.assign(result, await treeHashes(child));
    else result[child] = sha(await readFile(path.join(root, child)));
  }
  return result;
}
const protectedBefore = Object.assign({}, ...(await Promise.all(protectedPaths.map(treeHashes))));
const assets = {};
for (const name of ['spa.traineddata.gz', 'eng.traineddata.gz', 'worker.min.js'])
  assets[name] = sha(await readFile(path.join(root, 'public/ocr', name)));
for (const name of await readdir(path.join(root, 'public/ocr')))
  if (/\.wasm(?:\.js)?$/.test(name)) assets[name] = sha(await readFile(path.join(root, 'public/ocr', name)));
assert.deepEqual(assets, assetLock, 'OCR assets differ from the locked models');
for (const c of corpus.cases) {
  assert(/^images\/(football|nba|bet-builder|cashout|settled)\/[a-z][a-z0-9-]+\.png$/.test(c.image), 'Invalid fixture path');
  assert.equal(sha(await readFile(path.join(corpusRoot, c.image))), c.sha256, c.id + ': image hash mismatch');
}
const output = path.join(root, 'test-results/ocr-phase4b');
await mkdir(output, { recursive: true });
const server = await createServer({
  root, configFile: false,
  plugins: [auditPlugin({ enabled: false })],
  cacheDir: 'node_modules/.vite-ocr-phase4b',
  server: { host: '127.0.0.1', port: 0, hmr: false, strictPort: true },
  optimizeDeps: { entries: ['tests/ocr-phase4b/browser.ts'], include: ['tesseract.js', 'zod'] },
  logLevel: 'error',
});
let browser, context;
const blocked = [], results = [], errors = [];
let environment = null;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string', 'OCR localhost listener missing');
  const origin = 'http://127.0.0.1:' + address.port;
  browser = await chromium.launch();
  context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    blocked.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  await page.goto(origin + '/__ocr_phase1');
  environment = await page.evaluate(async () => {
    window.phase4b = await import('/tests/ocr-phase4b/browser.ts');
    return window.phase4b.start();
  });
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const c of cases) {
      try {
        const response = await page.evaluate(
          async (entry) => window.phase4b.runImage(
            '/tests/ocr-phase4a/' + entry.image, entry.expected),
          { image: c.image, expected: c.expected },
        );
        const { traces, ...result } = response;
        if (repeat === 0)
          await writeFile(path.join(output, c.id + '.raw.json'), JSON.stringify(traces, null, 2) + '\n');
        results.push({
          id: c.id, repeat, provenance: c.provenance, group:
            admission.records.find((record) => record.id === c.id)?.ticketGroup ?? null,
          ...result,
        });
        console.log(
          c.id + ' #' + (repeat + 1) + ': ' + Math.round(result.recognitionMs) +
          'ms, ' + result.reads + ' OCR pass(es), ' + result.quality.failures.length + ' mismatches',
        );
      } catch (error) {
        const failure = { id: c.id, repeat, message: String(error) };
        errors.push(failure);
        console.error(c.id + ' #' + (repeat + 1) + ' FAILED: ' + failure.message);
      }
    }
  }
  await page.evaluate(async () => window.phase4b.stop());
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
}
const protectedAfter = Object.assign({}, ...(await Promise.all(protectedPaths.map(treeHashes))));
assert.deepEqual(protectedAfter, protectedBefore, 'Protected production files changed');
assert.deepEqual(blocked, [], 'The isolated OCR browser attempted an external request');
const first = results.filter((r) => r.repeat === 0);
const checks = first.flatMap((r) => r.quality.checks);
const perField = {};
for (const c of checks) {
  const entry = perField[c.field] ??= { total: 0, correct: 0, missing: 0, wrong: 0 };
  entry.total++;
  if (c.correct) entry.correct++;
  else entry[c.status]++;
}
const observedGroups = new Set(first.map((r) => r.group).filter(Boolean));
const percentile = (values, ratio) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(ratio * values.length) - 1)] : null;
const durations = results.map((r) => r.recognitionMs);
const summary = {
  admittedCorpusImages: corpus.cases.length,
  measuredImages: first.length,
  attemptedImages: cases.length,
  conservativeGroupsMeasured: observedGroups.size,
  groupsDoNotProveUniqueTickets: true,
  checks: checks.length,
  correct: checks.filter((c) => c.correct).length,
  missing: checks.filter((c) => c.status === 'missing').length,
  wrong: checks.filter((c) => c.status === 'wrong').length,
  incompleteImages: first.filter((r) => !r.quality.complete).length,
  omittedSelections: first.reduce((n, r) => n + r.quality.omittedSelections, 0),
  extraSelections: first.reduce((n, r) => n + r.quality.extraSelections, 0),
  unsupportedConfirmations: first.filter((r) => r.quality.safety.unsupportedConfirmation).length,
  unsupportedWins: first.filter((r) => r.quality.safety.unsupportedWin).length,
  unsupportedExecutedCashouts: first.filter((r) => r.quality.safety.unsupportedExecutedCashout).length,
  recognitionP50Ms: percentile(durations, 0.5),
  recognitionP95Ms: percentile(durations, 0.95),
  runErrors: errors.length,
};
const report = {
  version: '4B',
  generatedAt: new Date().toISOString(),
  execution: 'real production OCR on reviewed 4A PNGs, isolated browser, no registration',
  strict,
  repeats,
  selectedIDs: selected ?? null,
  environment: { ...environment, node: process.version, browser: browser?.version(), os: os.platform() + ' ' + os.release() },
  corpusSha256: sha(await readFile(path.join(corpusRoot, 'cases.json'))),
  admissionsSha256: sha(await readFile(path.join(corpusRoot, 'admission.json'))),
  assets,
  protectedFilesUnchanged: true,
  networkAttempts: blocked,
  summary,
  perField,
  results,
  errors,
  limits: [
    'Results are OCR measurements, not evidence of actual bookmaker settlement.',
    'Missing and wrong count against literal checks; no identity or accent folding.',
    'Ordinal alignment penalizes omissions and shifts; it does not reconcile tickets.',
    'Unspecified period is not full-match; unknown placement is not preparation.',
    'A cashout offer is never an executed cashout or realized return.',
    'The production parser does not expose settledReturn; it is not scored.',
    'These 28 real PNGs contain no NBA, verified global wins, or executed cashout.',
    'The bet365 preparation-flamengo candidate remains outside this authorized corpus.',
    'Temporal groups are conservative, not a count of verified unique tickets.',
    'This audit performs no Supabase operations and no actual wager registration.',
  ],
};
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary, perField, report: 'test-results/ocr-phase4b/report.json' }, null, 2));
if (errors.length || (strict && first.some((r) => !r.quality.complete))) process.exitCode = 1;
