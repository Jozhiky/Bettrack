// Read-only qualification of automatic mode against the unchanged admitted corpus.
// No repository, Supabase client, financial writes or external network access.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { auditPlugin } from '../ocr-phase1/instrumentation.mjs';
const corpus = JSON.parse(await readFile('tests/ocr-phase4a/cases.json', 'utf8'));
assert.equal(corpus.cases.length, 28);
for (const entry of corpus.cases) {
  assert.match(entry.image, /^images\/[a-z-]+\/[a-z0-9-]+\.png$/);
  assert.equal(
    createHash('sha256')
      .update(await readFile('tests/ocr-phase4a/' + entry.image))
      .digest('hex'),
    entry.sha256,
  );
}
const server = await createServer({
  root: process.cwd(),
  configFile: false,
  plugins: [auditPlugin({ enabled: false })],
  cacheDir: 'node_modules/.vite-automatic-gate',
  server: { host: '127.0.0.1', port: 0, hmr: false, strictPort: true },
  optimizeDeps: { include: ['tesseract.js', 'zod'] },
  logLevel: 'error',
});
const browser = await chromium.launch(),
  blocked = [],
  results = [];
try {
  await server.listen();
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blocked.push(new URL(route.request().url()).origin);
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(180000);
  await page.goto(origin + '/__ocr_phase1');
  await page.evaluate(async () => {
    const { createRecognizer } = await import('/src/ocr/engine.ts');
    window.automaticReader = await createRecognizer();
  });
  for (const entry of corpus.cases) {
    if (process.env.OCR_CASE_IDS && !process.env.OCR_CASE_IDS.split(',').includes(entry.id))
      continue;
    const result = await page.evaluate(async (entry) => {
      const { readCapture } = await import('/src/ocr/readCapture.ts');
      const { prepareAutomaticPending } = await import('/src/ocr/automaticPending.ts');
      const { prepareAutomaticImport } = await import('/src/ocr/automaticImport.ts');
      const { evaluatePhase4B } = await import('/tests/ocr-phase4b/score.ts');
      const { parseTicket } = await import('/src/ocr/parser.ts');
      const { automaticTerms } = await import('/src/ocr/automaticEvidence.ts');
      const passes = [];
      const reader = {
        terminate: () => window.automaticReader.terminate(),
        recognize: async (...args) => {
          const result = await window.automaticReader.recognize(...args);
          passes.push(parseTicket(result.text, result.lines, result.symbols, result.visualMode));
          return result;
        },
      };
      const parsed = await readCapture(
        reader,
        await (await fetch('/tests/ocr-phase4a/' + entry.image)).blob(),
        () => {},
        false,
        true,
      );
      if (parsed.receiptOcr) passes.forEach((p) => (p.receiptOcr = parsed.receiptOcr));
      const left = JSON.parse(automaticTerms(passes[0])),
        right = JSON.parse(automaticTerms(passes[1]));
      const differences = (a, b, path = '') =>
        JSON.stringify(a) === JSON.stringify(b)
          ? []
          : a && b && typeof a === 'object' && typeof b === 'object'
            ? Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).flatMap((k) =>
                differences(a[k], b[k], path ? path + '.' + k : k),
              )
            : [path];
      const now = new Date().toISOString(),
        upload = {
          id: 'synthetic-qualification',
          imageId: 'synthetic',
          createdAt: now,
          status: 'review',
          progress: 100,
          reason: '',
          draftJson: JSON.stringify(parsed),
        };
      const historical = prepareAutomaticImport(upload, now),
        pending = prepareAutomaticPending(upload);
      const reasons = historical.evidence?.candidate ? historical.reasons : pending.reasons;
      const eligible =
        !!parsed.automaticEvidence && !parsed.reviewReasons?.length && !reasons.length;
      const quality = evaluatePhase4B(entry.expected, parsed);
      return {
        id: entry.id,
        eligible,
        agreement: !!parsed.automaticEvidence,
        reasons,
        supplemental: passes.slice(2).map((p) => ({ text: p.text, offer: p.cashoutOffer })),
        differences: differences(left, right),
        reviewReasons: passes.map((p) => p.reviewReasons),
        failures: quality.failures,
        checks: quality.checks.length,
        correct: quality.checks.filter((c) => c.correct).length,
        omitted: quality.omittedSelections,
        extra: quality.extraSelections,
        safety: quality.safety,
      };
    }, entry);
    results.push(result);
    console.log(
      `${entry.id}: ${result.eligible ? 'eligible' : 'draft'}, ${result.correct}/${result.checks}`,
    );
  }
  await page.evaluate(() => window.automaticReader.terminate());
  assert.deepEqual(blocked, []);
  const report = {
    summary: {
      images: results.length,
      eligible: results.filter((r) => r.eligible).length,
      correct: results.reduce((n, r) => n + r.correct, 0),
      checks: results.reduce((n, r) => n + r.checks, 0),
      omitted: results.reduce((n, r) => n + r.omitted, 0),
      extra: results.reduce((n, r) => n + r.extra, 0),
      eligibleWithDiscrepancies: results
        .filter((r) => r.eligible && r.failures.length)
        .map((r) => r.id),
    },
    results,
    blocked,
  };
  await mkdir('test-results/automatic-gate', { recursive: true });
  await writeFile('test-results/automatic-gate/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary, null, 2));
  assert(results.every((r) => !r.omitted && !r.extra && !Object.values(r.safety).some(Boolean)));
} finally {
  await browser.close();
  await server.close();
}
