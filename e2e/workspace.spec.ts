import { test, expect } from '@playwright/test';
import { syntheticImage } from './helpers';

test('una sola vista: arrastrar, convertir en apuesta y conservar captura sin duplicar tarjetas', async ({
  page,
}) => {
  await page.goto('/capturas');
  await expect(page).toHaveURL(/\/apuestas$/);
  await expect(page.getByRole('button', { name: 'Subir capturas', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Subir capturas/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Usar cámara' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 950 });
  await page.screenshot({ path: 'test-results/workspace-empty-375.png' });
  await page.getByRole('button', { name: /Terminadas/ }).click();
  await page.getByLabel('Buscar apuestas').fill('no coincide');
  const file = await syntheticImage(page);
  await page.evaluate(async (base64) => {
    const blob = await (await fetch('data:image/png;base64,' + base64)).blob();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], 'arrastrada.png', { type: 'image/png' }));
    window.dispatchEvent(
      new DragEvent('dragenter', { dataTransfer, bubbles: true, cancelable: true }),
    );
  }, file.buffer.toString('base64'));
  await expect(page.getByText('Suelta tus capturas aquí')).toBeVisible();
  await page.evaluate(async (base64) => {
    const blob = await (await fetch('data:image/png;base64,' + base64)).blob();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], 'arrastrada.png', { type: 'image/png' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
  }, file.buffer.toString('base64'));
  await expect(page.getByText('Suelta tus capturas aquí')).toHaveCount(0);
  await expect(page.getByLabel('Buscar apuestas')).toHaveValue('');
  await expect(page.getByRole('button', { name: /Pendientes/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.workspace-item')).toHaveCount(1);
  const id = await page.locator('.workspace-item').getAttribute('data-item-id');
  await expect(page.locator('.bet-card')).toHaveCount(1, { timeout: 90000 });
  await expect(page.locator('.workspace-item')).toHaveAttribute('data-item-id', id!);
  await expect(page.locator('.capture-card')).toHaveCount(0);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.locator('.workspace-scroll').evaluate((el) => el.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/workspace-${width}.png` });
  }
  await page.getByRole('button', { name: 'Cambiar tema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/workspace-dark-1440.png', animations: 'disabled' });
  await page.reload();
  await expect(page.locator('.workspace-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver detalle', exact: true }).click();
  await expect(page.getByAltText('Captura original del boleto')).toBeVisible();
});

test('filtros compactos accesibles sin desbordar en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 950 });
  await page.goto('/apuestas');
  const menu = page.locator('.workspace-filter-menu');
  await menu.locator('summary').first().click();
  const box = await menu.locator('.filter-region').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await page.getByLabel('Periodo', { exact: true }).selectOption('Personalizado');
  await page.getByLabel('Desde', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-10-16');
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(menu.locator('summary').first()).toBeFocused();
  await menu.locator('summary').first().click();
  await page.getByLabel('Filtrar tipo').selectOption('Combinada');
  await page.getByRole('heading', { name: 'Mis apuestas' }).click();
  await expect(menu).not.toHaveAttribute('open', '');
});
