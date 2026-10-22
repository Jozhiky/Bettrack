// Local-only comparison of cold initialization versus the queue's session.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const files = process.argv.slice(2);
if (!files.length) throw new Error('Provide local screenshot paths');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.goto('http://127.0.0.1:5186/');
  const reports = [];
  for (const mode of ['cold', 'session']) {
    for (const file of files) {
      const data = (await readFile(file)).toString('base64');
      const result = await page.evaluate(async ({ data, mode }) => {
        const { createRecognizer } = await import('/src/ocr/engine.ts');
        const { createOcrSession } = await import('/src/ocr/session.ts');
        const { readCapture } = await import('/src/ocr/readCapture.ts');
        const blob = await (await fetch('data:image/png;base64,' + data)).blob();
        const started = performance.now();
        const task = async reader => {
          const parsed = await readCapture(reader, blob, () => {});
          return { elapsedMs: Math.round(performance.now() - started), parsed };
        };
        if (mode === 'session') {
          window.__ocrSession ??= createOcrSession();
          return window.__ocrSession.run(task);
        }
        const reader = await createRecognizer();
        try { return await task(reader); } finally { await reader.terminate(); }
      }, { data, mode });
      if (mode === 'session') assert.deepEqual(result.parsed, reports.find(r => r.mode === 'cold' && r.file === file).parsed, 'Recognition changed: ' + file);
      reports.push({ mode, file, ...result });
      console.log(`${mode}: ${file}: ${result.elapsedMs}ms, ${result.parsed.selections.length} selections`);
    }
  }
  await page.evaluate(() => window.__ocrSession.dispose());
  const sum = mode => reports.filter(r => r.mode === mode).reduce((n, r) => n + r.elapsedMs, 0);
  const summary = { coldMs: sum('cold'), sessionMs: sum('session'), reductionPercent: Math.round((1 - sum('session') / sum('cold')) * 100), sameParsedResults: true };
  await mkdir('artifacts/ocr', { recursive: true });
  await writeFile('artifacts/ocr/benchmark.json', JSON.stringify({ verifiedAt: new Date().toISOString(), summary, reports }, null, 2));
  console.log(summary);
} finally { await browser.close(); }
