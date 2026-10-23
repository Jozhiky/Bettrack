import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { auditPlugin } from './instrumentation.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtureRoot = path.join(root, 'tests/ocr-phase1');
const corpus = JSON.parse(await readFile(path.join(fixtureRoot, 'cases.json'), 'utf8'));
const known = JSON.parse(await readFile(path.join(fixtureRoot, 'known-failures.json'), 'utf8'));
const phase2 = process.argv.includes('--phase2');
// Keep the historical Phase 1 oracle immutable. Only the five specifically
// repaired structural cases must now be exact; literal accent errors remain.
if (phase2)
  for (const id of [
    'unknown-market',
    'unknown-builder-market',
    'missing-odds',
    'injected-unknown-market',
    'injected-missing-odds',
  ])
    delete known[id];
const assetLock = JSON.parse(await readFile(path.join(fixtureRoot, 'assets.lock.json'), 'utf8'));
const repeats = Number(process.env.OCR_REPEATS ?? 3);
assert(Number.isInteger(repeats) && repeats >= 1 && repeats <= 20, 'OCR_REPEATS must be 1..20');
const sha = (b) => createHash('sha256').update(b).digest('hex');
async function treeHashes(folder) {
  const out = {};
  for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
    const childPath = `${folder}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, await treeHashes(childPath));
    else out[childPath] = sha(await readFile(path.join(root, childPath)));
  }
  return out;
}
const protectedPaths = ['src/ocr', 'src/data', 'src/domain', 'supabase/migrations'];
const protectedBefore = Object.assign({}, ...(await Promise.all(protectedPaths.map(treeHashes))));
const assets = {};
for (const name of ['spa.traineddata.gz', 'eng.traineddata.gz', 'worker.min.js'])
  assets[name] = sha(await readFile(path.join(root, 'public/ocr', name)));
for (const name of await readdir(path.join(root, 'public/ocr')))
  if (/\.wasm(?:\.js)?$/.test(name))
    assets[name] = sha(await readFile(path.join(root, 'public/ocr', name)));
assert.deepEqual(
  assets,
  assetLock,
  'OCR assets drifted; review model provenance before updating the lock',
);
for (const c of corpus.cases)
  assert.equal(
    sha(await readFile(path.join(fixtureRoot, c.image))),
    c.sha256,
    `${c.id}: image hash mismatch`,
  );

const server = await createServer({
  root,
  configFile: false,
  plugins: [auditPlugin()],
  cacheDir: 'node_modules/.vite-ocr-phase1',
  server: { host: '127.0.0.1', port: 0, hmr: false, strictPort: true },
  optimizeDeps: {
    entries: ['tests/ocr-phase1/browser.ts'],
    include: ['tesseract.js', 'dexie', 'fake-indexeddb', 'zod'],
  },
  logLevel: 'error',
});
let browser;
const strict = process.argv.includes('--strict');
const output = path.join(
  root,
  phase2
    ? strict
      ? 'test-results/ocr-phase2-strict'
      : 'test-results/ocr-phase2'
    : strict
      ? 'test-results/ocr-phase1-strict'
      : 'test-results/ocr-phase1',
);
function limitEvaluation(page) {
  const original = page.evaluate.bind(page);
  page.evaluate = async (...args) => {
    let timer;
    try {
      return await Promise.race([
        original(...args),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Audit case exceeded 120 seconds')), 120000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
await mkdir(output, { recursive: true });
const results = [];
const blocked = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blocked.push(new URL(route.request().url()).origin);
    return route.abort();
  });
  const page = await context.newPage();
  limitEvaluation(page);
  page.setDefaultTimeout(120000);
  await page.goto(`${origin}/__ocr_phase1`);
  const environment = await page.evaluate(async () => {
    window.audit = await import('/tests/ocr-phase1/browser.ts');
    return await window.audit.start();
  });
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const c of corpus.cases) {
      const result = await page.evaluate(
        async ({ c }) => await window.audit.runImage(`/tests/ocr-phase1/${c.image}`, c.expected),
        { c },
      );
      const { traces, ...rest } = result;
      if (repeat === 0)
        await writeFile(path.join(output, `${c.id}.trace.json`), JSON.stringify(traces, null, 2));
      results.push({ id: c.id, repeat, provenance: c.provenance, ...rest });
      console.log(
        `${c.id} #${repeat + 1}: ${Math.round(result.recognitionMs)}ms; ${result.reads} pass(es); ${result.quality.failures.length} field failures; ${result.registered.status}`,
      );
    }
  }
  const base = corpus.cases.find((c) => c.id === 'handicap-combination');
  for (const fault of ['missing-odds', 'unknown-market']) {
    const expected = structuredClone(base.expected);
    if (fault === 'missing-odds') expected.selections[0].odds = null;
    else expected.selections[1].market = 'Mercado experimental no catalogado';
    const result = await page.evaluate(
      async ({ base, expected, fault }) =>
        await window.audit.runImage(`/tests/ocr-phase1/${base.image}`, expected, fault),
      { base, expected, fault },
    );
    const { traces, ...rest } = result;
    results.push({
      id: `injected-${fault}`,
      repeat: 0,
      provenance: 'real-image-with-controlled-ocr-fault',
      ...rest,
    });
    await writeFile(
      path.join(output, `injected-${fault}.trace.json`),
      JSON.stringify(traces, null, 2),
    );
    console.log(
      `injected-${fault}: ${result.quality.failures.length} field failures; ${result.registered.status}`,
    );
  }
  const probes = await page.evaluate(() => window.audit.runProbes());
  await page.evaluate(() => window.audit.stop());
  // Verify the on-the-fly profiler changes neither parsed data nor registration.
  // This second server serves uninstrumented production OCR/parser modules.
  const plainServer = await createServer({
    root,
    configFile: false,
    plugins: [auditPlugin({ enabled: false })],
    cacheDir: 'node_modules/.vite-ocr-phase1-plain',
    server: { host: '127.0.0.1', port: 0, hmr: false, strictPort: true },
    optimizeDeps: {
      entries: ['tests/ocr-phase1/browser.ts'],
      include: ['tesseract.js', 'dexie', 'fake-indexeddb', 'zod'],
    },
    logLevel: 'error',
  });
  const plainContext = await browser.newContext({ serviceWorkers: 'block' });
  const instrumentationParity = [];
  try {
    await plainServer.listen();
    const plainOrigin = `http://127.0.0.1:${plainServer.httpServer.address().port}`;
    await plainContext.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === plainOrigin) return route.continue();
      blocked.push(new URL(route.request().url()).origin);
      return route.abort();
    });
    const plainPage = await plainContext.newPage();
    limitEvaluation(plainPage);
    await plainPage.goto(`${plainOrigin}/__ocr_phase1`);
    await plainPage.evaluate(async () => {
      window.audit = await import('/tests/ocr-phase1/browser.ts');
      await window.audit.start();
    });
    for (const c of corpus.cases) {
      const plain = await plainPage.evaluate(
        async (c) => await window.audit.runImage(`/tests/ocr-phase1/${c.image}`, c.expected),
        c,
      );
      const measured = results.find((r) => r.id === c.id && r.repeat === 0);
      assert.deepEqual(plain.parsed, measured.parsed, `${c.id}: profiling changed parsed output`);
      assert.deepEqual(
        plain.registered,
        measured.registered,
        `${c.id}: profiling changed registration`,
      );
      instrumentationParity.push({ id: c.id, equal: true });
    }
    await plainPage.evaluate(() => window.audit.stop());
    console.log('Uninstrumented parity: 5/5 identical parsed and registration results');
  } finally {
    await plainContext.close();
    await plainServer.close();
  }
  const differences = [];
  for (const result of [...results, ...probes]) {
    const actual = result.quality.failures.map((f) => `${f.path}:${f.status}`).sort();
    const expected = known[result.id]?.signatures ?? [];
    const observed = Object.fromEntries(result.quality.failures.map((f) => [f.path, f.actual]));
    const expectedObserved = known[result.id]?.observed ?? {};
    try {
      assert.deepEqual(actual, [...expected].sort());
      assert.deepEqual(observed, expectedObserved);
    } catch {
      differences.push({ id: result.id, expected, actual, expectedObserved, observed });
    }
    assert.equal(
      result.registered.settlements,
      0,
      `${result.id}: cashout offer created a settlement`,
    );
    const expectedStatus =
      result.id.startsWith('injected-') || result.knownFailure ? 'review' : 'saved';
    assert.equal(
      result.registered.status,
      expectedStatus,
      `${result.id}: registration status drifted`,
    );
    assert.equal(
      result.registered.bets,
      expectedStatus === 'saved' ? 1 : 0,
      `${result.id}: unexpected bet count`,
    );
    assert.equal(
      result.registered.movements,
      expectedStatus === 'saved' ? 1 : 0,
      `${result.id}: unexpected movement count`,
    );
    if (result.quality.omittedLegs)
      assert.equal(
        result.registered.status,
        'review',
        `${result.id}: omitted legs were registered`,
      );
  }
  const protectedAfter = Object.assign({}, ...(await Promise.all(protectedPaths.map(treeHashes))));
  assert.deepEqual(protectedAfter, protectedBefore, 'Protected production files changed');
  assert.equal(blocked.length, 0, 'Harness tried to contact an external service');
  const real = results.filter((r) => r.provenance === 'real-capture-deidentified');
  const percentile = (values, q) =>
    [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * q) - 1)];
  const phaseSummary = Object.fromEntries(
    Object.keys(real[0].metrics).map((phase) => {
      const values = real.map((r) => r.metrics[phase].ms);
      return [
        phase,
        { samples: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95) },
      ];
    }),
  );
  const qualitySummary = {};
  // Quality counted once per image, not multiplied by repeated timing samples.
  for (const result of real.filter((r) => r.repeat === 0))
    for (const [field, score] of Object.entries(result.quality.fields)) {
      qualitySummary[field] ??= { correct: 0, total: 0, missing: 0, wrong: 0 };
      for (const key of Object.keys(score)) qualitySummary[field][key] += score[key];
    }
  const report = {
    version: phase2 ? 2 : 1,
    generatedAt: new Date().toISOString(),
    repeats,
    environment: {
      ...environment,
      browser: browser.version(),
      node: process.version,
      os: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
    },
    corpusHash: sha(await readFile(path.join(fixtureRoot, 'cases.json'))),
    packageLockHash: sha(await readFile(path.join(root, 'package-lock.json'))),
    assets,
    productionHashes: protectedBefore,
    networkAttempts: blocked,
    protectedFilesUnchanged: true,
    instrumentationParity,
    phaseSummary,
    qualitySummary,
    results,
    probes,
    baselineDifferences: differences,
    limitations: [
      'Registration uses fake-indexeddb in RAM, NOT Supabase.',
      'Five images do not represent all Betano markets.',
      'Exclusive phase timings follow existing mixed function boundaries.',
      'Ordinal leg alignment penalizes omissions and shifts; not a semantic classifier.',
    ],
  };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ phaseSummary, qualitySummary, differences }, null, 2));
  if (differences.length || (strict && [...results, ...probes].some((r) => !r.quality.complete)))
    process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
