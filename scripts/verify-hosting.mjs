// Production smoke test. Uses a fresh browser profile and a synthetic image only.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const origin = 'https://bettrack-wostcloud1.web.app';
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const localHtml = await readFile('dist/index.html');
const asset = localHtml.toString().match(/src="(\/assets\/[^" ]+\.js)"/)[1];
const checks = [];
for (const path of [
  '/',
  '/apuestas',
  '/banca',
  '/bettrack-sw.js',
  asset,
  '/ocr/worker.min.js',
  '/ocr/tesseract-core.wasm',
  '/manifest.webmanifest',
]) {
  const response = await fetch(origin + path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const local = ['/', '/apuestas', '/banca'].includes(path)
    ? localHtml
    : await readFile(`dist${path}`);
  if (hash(body) !== hash(local)) throw new Error(`Published file differs: ${path}`);
  checks.push({
    path,
    status: response.status,
    type: response.headers.get('content-type'),
    cache: response.headers.get('cache-control'),
    sha256: hash(body),
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: origin });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await mkdir('test-results', { recursive: true });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/apuestas');
    await expect(page.getByRole('button', { name: 'Entrar a BETTRACK' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/firebase-login-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await expect(page.getByLabel('Confirmar contraseña', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/firebase-signup-${width}.png`, fullPage: true });
  }
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'bettrack-local-v1'))).toBe(false);
  expect(errors).toEqual([]);
  const report = { origin, verifiedAt: new Date().toISOString(), checks, login: true, signup: true, responsive: [375, 768, 1440], pageErrors: errors };
  await writeFile('test-results/firebase-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
