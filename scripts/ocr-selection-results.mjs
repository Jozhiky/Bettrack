import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { auditPlugin } from './ocr-phase1/instrumentation.mjs';
import { selectionResultImage } from './persistence-qa/selection-result-fixtures.mjs';
// Local-only preflight of newly drawn fixtures. No repository/Supabase imports or writes.
const server = await createServer({
  root: process.cwd(),
  configFile: false,
  plugins: [auditPlugin({ enabled: false })],
  cacheDir: 'node_modules/.vite-selection-results',
  server: { host: '127.0.0.1', port: 0, hmr: false },
  optimizeDeps: { entries: [], include: ['tesseract.js', 'zod'] },
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
  await page.goto(origin + '/__ocr_phase1');
  await page.evaluate(async () => {
    const { createRecognizer } = await import('/src/ocr/engine.ts');
    window.resultReader = await createRecognizer();
  });
  for (const kind of ['Simple', 'Combinada', 'Builder']) {
    const file = await selectionResultImage(page, kind);
    const result = await page.evaluate(
      async ({ base64, kind }) => {
        const { readCapture } = await import('/src/ocr/readCapture.ts');
        const { prepareAutomaticPending } = await import('/src/ocr/automaticPending.ts');
        const { prepareAutomaticImport } = await import('/src/ocr/automaticImport.ts');
        const blob = new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
          type: 'image/png',
        });
        const draft = await readCapture(window.resultReader, blob, () => {}, false, true);
        const now = new Date().toISOString(),
          u = {
            id: 'u',
            imageId: 'i',
            createdAt: now,
            status: 'review',
            progress: 100,
            reason: '',
            draftJson: JSON.stringify(draft),
          };
        const h = prepareAutomaticImport(u, now),
          p = prepareAutomaticPending(u);
        return {
          kind,
          result: h.evidence?.kind ?? 'Pendiente',
          reasons: h.evidence?.candidate ? h.reasons : p.reasons,
          agreement: !!draft.automaticEvidence,
          draft,
        };
      },
      { base64: file.buffer.toString('base64'), kind },
    );
    results.push(result);
  }
  await page.evaluate(() => window.resultReader.terminate());
  await mkdir('test-results/selection-results-synthetic', { recursive: true });
  await writeFile(
    'test-results/selection-results-synthetic/report.json',
    JSON.stringify({ results, blocked }, null, 2),
  );
  assert.deepEqual(blocked, []);
  for (const r of results) {
    assert.equal(r.result, r.kind === 'Builder' ? 'Pendiente' : 'Perdida', r.kind);
    assert.equal(r.agreement, true, r.kind);
    assert.deepEqual(r.reasons, [], r.kind);
    assert.equal(
      r.draft.ticketReference,
      'QAVISUAL' + (r.kind === 'Simple' ? 'A' : r.kind === 'Combinada' ? 'B' : 'C'),
    );
    console.log(r.kind + ': ' + r.result + ', valid agreement');
  }
} finally {
  await browser.close();
  await server.close();
}
