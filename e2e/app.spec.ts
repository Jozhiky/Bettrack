import { uploadSynthetic } from './helpers';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('flujo real: capital, apuesta, liquidación, recarga y maestros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/banca');
  await expect(page.getByRole('heading', { name: 'Banca y movimientos' })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await page.getByLabel('Importe', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/capturas');
  await uploadSynthetic(page);
  await expect(page.locator('.bet-card')).toHaveCount(1, { timeout: 90000 });
  await page.goto('/apuestas');
  await page.reload();
  await expect(page.getByLabel('Filtrar tipo').locator('option')).toHaveText([
    'Todos los tipos',
    'Simple',
    'Combinada',
  ]);
  await expect(page.getByLabel('Filtrar estado').locator('option')).toHaveText([
    'Todos los estados',
    'Pendiente',
    'Ganada',
    'Perdida',
    'Cashout',
  ]);
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click();
  await expect(page.getByLabel('Resultado', { exact: true }).locator('option')).toHaveText([
    'Ganada',
    'Perdida',
    'Cashout',
  ]);
  await expect(page.getByLabel('Stake que se cierra')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Cashout', exact: true }).click();
  await page.getByLabel('Monto cobrado').fill('5');
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Terminadas/ }).click();
  await page.getByRole('button', { name: 'Tabla', exact: true }).click();
  await expect(page.locator('tbody .badge')).toHaveText('Cashout');
  await expect(page.locator('tbody .negative')).toContainText('5.00');
  await page.goto('/');
  await expect(page.locator('.kpi').filter({ hasText: 'Resultado neto' })).toContainText('5.00');
  await page.screenshot({ path: 'test-results/dashboard-populated.png', fullPage: true });
  await page.goto('/casas');
  await page.getByRole('button', { name: 'Nueva casa' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Mi casa');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi casa', exact: true })).toBeVisible();
  await page.goto('/streamers');
  await page.getByRole('button', { name: 'Nuevo streamer' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Mi pronosticador');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi pronosticador', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
for (const width of [375, 768, 1440])
  test(`responsive ${width}px, navegación y tema`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    for (const path of [
      '/',
      '/apuestas',
      '/capturas',
      '/banca',
      '/casas',
      '/streamers',
      '/estadisticas',
      '/configuracion',
    ]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Resumen de tu banca' })).toBeVisible();
    await page.screenshot({ path: `test-results/dashboard-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cambiar tema' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: `test-results/dashboard-dark-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Subir capturas', exact: true }).click();
    await expect(page).toHaveURL(/apuestas/);
    await page.goto('/casas');
    await page.getByRole('button', { name: 'Nueva casa' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
test('OCR real sin red, guardado de captura y respaldo/restauración', async ({ page, browser }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (!/^(http:\/\/127\.0\.0\.1:5189|blob:|data:)/.test(request.url()))
      externalRequests.push(request.url());
  });
  await page.goto('/banca');
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await page.getByLabel('Importe', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/capturas');
  await expect(page.getByRole('heading', { name: 'Mis apuestas' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 900;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 1000, 900);
    ctx.fillStyle = 'black';
    ctx.font = '36px Arial';
    [
      'BETANO',
      'Apuesta Simple',
      'Alianza vs Universitario',
      'Goles del partido',
      'Mas de 2.5',
      'Cuota total: 2.00',
      'Importe apostado S/ 10.00',
      'Retorno potencial S/ 20.00',
    ].forEach((l, i) => ctx.fillText(l, 50, 80 + i * 90));
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.context().setOffline(true);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'boleto-sintetico.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    });
  await expect(page.locator('.bet-card')).toHaveCount(1, { timeout: 90000 });
  await expect(page.locator('.bet-card')).toContainText('10.00');
  await expect(page.locator('.bet-card')).toContainText('20.00');
  await page.screenshot({ path: 'test-results/ocr-synthetic.png', fullPage: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Resumen de tu banca' })).toBeVisible();
  await expect(
    page
      .locator('.kpi')
      .filter({ has: page.locator('.kpi-label', { hasText: 'Capital en riesgo' }) }),
  ).toContainText('10.00');
  await page.goto('/configuracion');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Respaldo JSON completo' }).click();
  const file = await downloaded;
  const buffer = await readFile((await file.path())!);
  const backup = JSON.parse(buffer.toString());
  expect(backup.images).toHaveLength(1);
  expect(backup.uploads).toHaveLength(1);
  expect(backup.data.bets).toHaveLength(1);
  expect(backup.images[0].hash).toMatch(/^[a-f0-9]{64}$/);
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:5189' });
  const restored = await other.newPage();
  await restored.goto('/configuracion');
  await restored
    .locator('input[type=file]')
    .setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer });
  await restored.getByRole('button', { name: 'Confirmar restauración' }).click();
  await expect(restored.getByRole('dialog')).toHaveCount(0);
  // Idempotent merge: restoring the same snapshot again does not duplicate bets or money.
  await restored
    .locator('input[type=file]')
    .setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer });
  await restored.getByRole('button', { name: 'Confirmar restauración' }).click();
  await expect(restored.getByRole('dialog')).toHaveCount(0);
  await restored.goto('/apuestas');
  await restored.getByRole('button', { name: 'Tabla', exact: true }).click();
  await expect(restored.locator('tbody tr')).toHaveCount(1);
  await restored.locator('button.table-link').click();
  await expect(restored.getByAltText('Captura original del boleto')).toBeVisible();
  await restored.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await restored.goto('/');
  await expect(restored.locator('.kpi').filter({ hasText: 'Banca consolidada' })).toContainText(
    '100.00',
  );
  await other.close();
  expect(externalRequests).toEqual([]);
});
