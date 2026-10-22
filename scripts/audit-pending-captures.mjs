// Read-only reproduction: matched local originals, no cloud writes or credentials.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const rows = JSON.parse(await readFile('artifacts/ocr/six-captures-cloud.json', 'utf8'));
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage();
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.goto('http://127.0.0.1:5186/');
  for (const row of rows) {
    const bytes = await readFile(`D:/richa/${row.image.name}`);
    if (createHash('sha256').update(bytes).digest('hex') !== row.image.originalHash) throw new Error('Original mismatch');
    const result = await page.evaluate(async base64 => {
      const { createRecognizer } = await import('/src/ocr/engine.ts');
      const { readCapture } = await import('/src/ocr/readCapture.ts');
      const { selectionSchema } = await import('/src/domain/model.ts');
      const blob = await (await fetch('data:image/png;base64,' + base64)).blob();
      const reader = await createRecognizer();
      try {
        const parsed = await readCapture(reader, blob, () => {});
        return { parsed, issues: parsed.selections.flatMap((s, i) => {
          const check = selectionSchema.safeParse({ ...s, id:'audit', betId:'audit' });
          return check.success ? [] : [{ selection:i + 1, issues:check.error.issues }];
        }) };
      } finally { await reader.terminate(); }
    }, bytes.toString('base64'));
    results.push({ file:row.image.name, ...result });
    console.log(JSON.stringify({ file:row.image.name, found:result.parsed.selections.length, expected:result.parsed.expectedSelections, odds:result.parsed.odds, invalid:result.issues.map(i=>i.selection) }));
  }
  await writeFile('artifacts/ocr/six-captures-reproduction.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
