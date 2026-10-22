import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const svg = await readFile('public/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [192, 512]) {
  const image = await page.evaluate(
    async ({ svg, size }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(svg);
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#111b30';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, size * 0.1, size * 0.1, size * 0.8, size * 0.8);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { svg, size },
  );
  await writeFile(`public/icon-${size}.png`, Buffer.from(image, 'base64'));
}
await browser.close();
