// Real screenshots, local browser only; compare decoded pixels and OCR output.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.goto('http://127.0.0.1:5186/');
  const reports = [];
  for (const file of process.argv.slice(2)) {
    const data = (await readFile(file)).toString('base64');
    const result = await page.evaluate(async data => {
      const { optimizeImage } = await import('/src/ocr/optimize.ts');
      const { createOcrSession } = await import('/src/ocr/session.ts');
      const { readCapture } = await import('/src/ocr/readCapture.ts');
      const original = await (await fetch('data:image/png;base64,' + data)).blob();
      const start = performance.now();
      const optimized = await optimizeImage(original);
      const elapsedMs = Math.round(performance.now() - start);
      const pixels = async blob => {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap,0,0); bitmap.close();
        return { width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data };
      };
      const a = await pixels(original), b = await pixels(optimized.blob);
      const samePixels = a.width === b.width && a.height === b.height && a.data.every((v,i)=>v===b.data[i]);
      const session = createOcrSession();
      try {
        const before = await session.run(r=>readCapture(r,original,()=>{}));
        const after = await session.run(r=>readCapture(r,optimized.blob,()=>{}));
        return {originalBytes:original.size,bytes:optimized.blob.size,type:optimized.blob.type,elapsedMs,width:b.width,height:b.height,samePixels,sameOCR:JSON.stringify(before)===JSON.stringify(after),selections:after.selections.length};
      } finally {session.dispose();}
    }, data);
    assert(result.samePixels, 'Pixels changed: '+file);
    assert(result.sameOCR, 'OCR changed: '+file);
    assert(result.bytes <= result.originalBytes);
    reports.push({file,...result});
    console.log({file,...result});
  }
  assert(reports.length);
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/image-optimization.json',JSON.stringify(reports,null,2));
} finally {await browser.close();}
