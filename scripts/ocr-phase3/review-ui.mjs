import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { auditPlugin } from '../ocr-phase1/instrumentation.mjs';
const blocked = [],
  errors = [],
  results = [];
const mock = {
  name: 'review-qa-only',
  enforce: 'pre',
  transform(code, id) {
    const p = id.split('?')[0].replaceAll('\\', '/');
    if (p.endsWith('/src/app/context.tsx'))
      return `export const useModalError=()=>null; export const useApp=()=>({data:{bets:[],selections:[],houses:[]},run:async f=>{await f();return true;}});`;
    if (p.endsWith('/src/data/useCloudQuery.ts'))
      return `export const useLiveQuery=()=>window.__fixtureImage;`;
    if (p.endsWith('/src/data/captures.ts'))
      return `export const confirmCaptureReview=async(id,p)=>{window.__review={id,p};};export const enqueueCaptures=async()=>({added:1,failed:[]});export const linkCapture=async()=>{};`;
  },
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== '/__review_qa') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(
        await server.transformIndexHtml(
          req.url,
          '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Revisión QA aislada</title><div id="root"></div><script type="module" src="/tests/ocr-phase3/review-ui.tsx"></script></html>',
        ),
      );
    });
  },
};
const server = await createServer({
  configFile: false,
  plugins: [mock, auditPlugin({ enabled: false }), react(), tailwind()],
  server: { host: '127.0.0.1', port: 0, hmr: false },
  logLevel: 'error',
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  await mkdir('test-results/ocr-phase3-ui', { recursive: true });
  for (const width of [375, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blocked.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => (errors.push(e.message), console.error(e.message)));
    await page.goto(`${origin}/__review_qa`);
    await expect(page.getByRole('button', { name: 'Mejorar lectura', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Añadir comprobante de apuesta', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Revisar datos', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByLabel('Cuota 1', { exact: true }).fill('1.60');
    await page.getByRole('button', { name: 'Ver resumen antes de registrar' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar y registrar apuesta' }),
    ).toBeDisabled();
    await page.screenshot({
      path: `test-results/ocr-phase3-ui/review-${width}.png`,
      fullPage: true,
    });
    const layout = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        right: r.right,
        width: r.width,
        viewport: innerWidth,
        overflow: el.scrollWidth > el.clientWidth + 1,
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(width);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirmar y registrar apuesta' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__review.p.acknowledged)).toBe(true);
    await page.getByRole('button', { name: 'Revisar datos', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    results.push({ width, layout, explicitConsent: true, escapeCloses: true });
    await context.close();
  }
  expect(blocked).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    'test-results/ocr-phase3-ui/report.json',
    JSON.stringify(
      { results, blocked, errors, backend: 'Mocked actions. No cloud synchronization claim.' },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
