import { test, expect } from '@playwright/test';
import { syntheticImage } from './helpers';
import { readFile } from 'node:fs/promises';
test('pegar captura, vincular actualización, deshacer y cashout completo', async ({ page }) => {
  await page.goto('/capturas');
  await expect(page.getByRole('button', { name: 'Subir capturas', exact: true })).toBeVisible();
  const file = await syntheticImage(page);
  await page.evaluate(async (base64) => {
    const blob = await (await fetch('data:image/png;base64,' + base64)).blob();
    const clipboardData = new DataTransfer();
    clipboardData.items.add(new File([blob], 'pegada.png', { type: 'image/png' }));
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, file.buffer.toString('base64'));
  await expect(page.locator('.bet-card')).toHaveCount(1, { timeout: 90000 });
  const updated = await syntheticImage(page, 'Alianza vs Universitario', 'Cash Out S/ 8.00');
  await page.locator('input[type=file]').first().setInputFiles(updated);
  await expect(page.locator('.capture-card[data-status=duplicate]')).toHaveCount(1, {
    timeout: 90000,
  });
  await page.getByRole('button', { name: 'Comparar capturas', exact: true }).click();
  await expect(page.getByAltText('Captura registrada')).toBeVisible();
  await expect(page.getByAltText('Nueva captura')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Es el mismo boleto' }).click();
  await expect(page.locator('.capture-card')).toHaveCount(0);
  await expect(page.locator('.bet-card')).toHaveCount(1);
  await page.goto('/apuestas');
  await expect(page.locator('.bet-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Perdida', exact: true }).click();
  await expect(page.locator('.bet-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.locator('.bet-card')).toHaveCount(1);
  await expect(page.locator('.bet-card .badge')).toHaveText('Pendiente');
  await page.getByRole('button', { name: 'Cashout', exact: true }).click();
  await page.getByLabel('Monto cobrado').fill('6');
  await expect(page.getByRole('dialog').locator('input')).toHaveCount(1);
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.bet-card')).toHaveCount(0);
  await page.getByRole('button', { name: /Terminadas/ }).click();
  await expect(page.locator('.bet-card .badge')).toHaveText('Cashout');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/tracking-${width}.png`, fullPage: true });
  }
  await expect(page.locator('.bet-card')).toContainText('-S/ 4.00');
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Seguimiento · 1/ })).toBeVisible();
  await page.getByText(/Captura del .*Oferta cashout/).click();
  await expect(page.getByAltText('Actualización del boleto')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.goto('/configuracion');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Respaldo JSON completo' }).click();
  const exported = await download;
  const backup = JSON.parse(await readFile((await exported.path())!, 'utf8'));
  expect(backup.data.bets).toHaveLength(1);
  expect(backup.images).toHaveLength(2);
  expect(backup.uploads.filter((u: { status: string }) => u.status === 'linked')).toHaveLength(1);
  expect(
    backup.data.movements.filter((m: { kind: string }) => m.kind === 'Apuesta colocada'),
  ).toHaveLength(1);
});

test('paginación de capturas antiguas y filtros en móvil', async ({ page }) => {
  await page.goto('/capturas');
  const file = await syntheticImage(page);
  await page.evaluate(async (base64) => {
    const blob = await (await fetch('data:image/png;base64,' + base64)).blob();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('bettrack-local-v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const t = db.transaction(['uploads', 'images'], 'readwrite');
        for (let i = 0; i < 61; i++) {
          const key = `pagination-${i}`;
          t.objectStore('images').put({
            id: key,
            name: `Captura ${i + 1}.png`,
            hash: '0'.repeat(64),
            blob,
          });
          t.objectStore('uploads').put({
            id: key,
            imageId: key,
            createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
            status: 'review',
            progress: 100,
            draftJson: '',
            reason: 'Fixture de paginación',
          });
        }
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      };
    });
  }, file.buffer.toString('base64'));
  await page.reload();
  await expect(page.locator('.capture-card')).toHaveCount(12);
  const nav = page.getByRole('navigation', { name: 'Paginación de boletos' });
  await expect(nav).toContainText('de 61');
  await nav.getByRole('button', { name: 'Última página' }).click();
  await expect(page.locator('.capture-card')).toHaveCount(1);
  await expect(page.locator('.capture-card')).toContainText('Captura 1.png');
  await nav.getByLabel('boletos por página').selectOption('24');
  await expect(page.locator('.capture-card')).toHaveCount(24);
  await page.getByRole('button', { name: /Terminadas/ }).click();
  await expect(page.locator('.capture-card')).toHaveCount(0);
  await expect(nav).toContainText('Página 1 de 1');
  await page.getByRole('button', { name: /Pendientes/ }).click();
  await expect(page.locator('.capture-card')).toHaveCount(24);
  await page.setViewportSize({ width: 375, height: 950 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/pagination-mobile.png' });
});
