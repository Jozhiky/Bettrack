// Pixel-level regression of the user's seven matching originals. Read-only:
// local browser OCR, no cloud writes, no credentials, all external requests blocked.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const cases = [
  [44, '36b972fb4885c1161a64690c856e34e46de0e5b28dfb9ce96ffcbf8f0b09a7b5', 1, 1000, 1.6, 1600],
  [45, 'a0c40e73abf753f346ef05de16eb8150b3dd5598921aa011c8d9581aee93f2c3', 1, 1000, 2.22, 2220],
  [46, 'cb946a7c5d6f9ab080f484431b97dc663e028216b41027088d15c167ff342941', 2, 1000, 1.9, 1904],
  [48, '1092c912cb007bb3c4a0914cc715c4ef76f994a10ce02aea9d7409152e46883d', 2, 500, 10.6, 5300],
  [55, 'f44ecfec03852525a0c3af1e51cfd1029fef4701d47c9d5bdc8aa831b549f384', 2, 1500, 1.77, 2667],
  [58, '203f56c3952dccb82d9049f18cacaaf6ef8988a680a765d701ff764e01495a91', 3, 500, 5.69, 2846],
  [59, 'ba794ddd8a81cb477a7c70f7e3068a088332a3ba67a2ba871fc600bc16ec0060', 1, 500, 2.07, 1035],
  [71, 'b7eda0dd740d19b95b45058279e98d3249e272a7d4ea1d4e05aeb53e446f78b3', 3, 2000, 2.59, 5187],
];
const browser = await chromium.launch();
const results = [];
try {
  const page = await browser.newPage();
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.goto('http://127.0.0.1:5186/');
  for (const [number, hash, count, stake, odds, potential] of cases) {
    const file = `bet (${number}).png`;
    const bytes = await readFile(`D:/richa/${file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, `${file}: original changed`);
    const result = await page.evaluate(async base64 => {
      const { createRecognizer } = await import('/src/ocr/engine.ts');
      const { readCapture } = await import('/src/ocr/readCapture.ts');
      const { selectionSchema } = await import('/src/domain/model.ts');
      const reader = await createRecognizer();
      try {
        const blob = await (await fetch('data:image/png;base64,' + base64)).blob();
        const parsed = await readCapture(reader, blob, () => {});
        return { parsed, valid: parsed.selections.every(s => selectionSchema.safeParse({ ...s, id: 'test', betId: 'test' }).success) };
      } finally { await reader.terminate(); }
    }, bytes.toString('base64'));
    const p = result.parsed;
    assert.equal(result.valid, true, file);
    assert.equal(p.house, 'Betano', file);
    assert.equal(p.kind, count === 1 ? 'Simple' : 'Combinada', file);
    assert.equal(p.expectedSelections, count, file);
    assert.equal(p.selections.length, count, file);
    assert.equal(p.stake, stake, file);
    assert.equal(p.odds, odds, file);
    assert.equal(p.potential, potential, file);
    assert.equal(p.visibleStatus, undefined, file);
    if (number === 71) {
      assert.deepEqual(p.selections.map(s => s.event), [
        'Barranquilla FC vs. América de Cali',
        'Deportivo Toluca FC vs. Club Tijuana',
        'Independiente Santa Fe vs. Jaguares de Córdoba',
      ]);
      assert.equal(p.selections[1].pick, 'Club Tijuana +3');
      assert.equal(p.selections[1].market, 'Hándicap Resultado del Partido');
      assert.equal(p.cashoutOffer, 1699);
    }
    if (number === 48) {
      assert.deepEqual(p.selections.map(s => s.builderMarkets.length), [5, 2]);
      for (const child of p.selections.flatMap(s => s.builderMarkets)) {
        assert.equal(child.pick, '1+');
        assert.equal(child.promotion, 'Suplente de Oro');
        assert.match(child.market, /Tiros al Arco$/);
      }
    }
    results.push({ file, hash, ...result });
    console.log(JSON.stringify({ file, events: count, stake, odds, potential, valid: true }));
  }
  await writeFile('artifacts/ocr/expanded-markets-verified.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
