// Local regression probe. Does not save bets or send images to any external service.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const files = process.argv.slice(2);
if (!files.length) throw new Error('Provide local image paths.');
await mkdir('artifacts/ocr', { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5186/capturas');
  for (let index = 0; index < files.length; index++) {
    const data=(await readFile(files[index])).toString('base64');
    const result = await page.evaluate(async (data) => {
      const { recognize, preprocess } = await import('/src/ocr/engine.ts');
      const { parseTicket } = await import('/src/ocr/parser.ts');
      const file = await (await fetch('data:image/png;base64,'+data)).blob();
      const output = await recognize(file, () => {});
      return {
        ...output,
        parsed: parseTicket(output.text, output.lines, output.symbols),
        preview: (await preprocess(file)).toDataURL(),
      };
    }, data);
    const { preview, ...json } = result;
    await writeFile(`artifacts/ocr/ticket-${index}.json`, JSON.stringify(json, null, 2));
    await writeFile(
      `artifacts/ocr/processed-${index}.png`,
      Buffer.from(preview.split(',')[1], 'base64'),
    );
    console.log(
      JSON.stringify(
        {
          file: files[index],
          confidence: result.confidence,
          text: result.text,
          parsed: result.parsed,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await browser.close();
}
