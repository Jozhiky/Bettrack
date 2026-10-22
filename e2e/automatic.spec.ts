import { test, expect } from '@playwright/test';
import { syntheticImage, uploadSynthetic } from './helpers';
test('varias capturas, recarga durante OCR, duplicados y resultados rápidos sin banca inicial', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/capturas');
  const one = await syntheticImage(page),
    two = await syntheticImage(page, 'Barcelona vs Madrid'),
    three = await syntheticImage(page, 'Lima vs Cusco');
  await page.locator('input[type=file]').first().setInputFiles([one, two, three]);
  await expect(page.locator('.workspace-item')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('.bet-card')).toHaveCount(3, {
    timeout: 120000,
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/automatic-pending.png', fullPage: true });
  await page.getByRole('button', { name: 'Ganada', exact: true }).first().click();
  await page.getByRole('button', { name: 'Perdida', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cashout', exact: true }).first().click();
  await expect(page.getByRole('dialog').locator('input:not([type=checkbox])')).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 950 });
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/automatic-cashout.png' });
  await page.getByLabel('Monto cobrado').fill('30');
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.skip-link')).not.toBeFocused();
  await page.getByRole('button', { name: /Terminadas/ }).click();
  await expect(
    page.locator('.bet-card').filter({ has: page.locator('.badge.cashout') }),
  ).toContainText('30.00');
  for (const status of ['Ganada', 'Perdida', 'Cashout'])
    await expect(page.locator('.bet-card .badge').filter({ hasText: status })).toHaveCount(1);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/automatic-${width}.png`, fullPage: true });
  }
  await uploadSynthetic(page);
  await expect(page.locator('.capture-card[data-status=duplicate]')).toHaveCount(1, {
    timeout: 90000,
  });
  await page.goto('/apuestas');
  await page.getByRole('button', { name: /Todas/ }).click();
  await page.getByRole('button', { name: 'Tabla', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('tbody tr .badge')).toHaveCount(3);
  await page.goto('/');
  await expect(page.locator('.kpi').filter({ hasText: 'Resultado neto' })).toContainText('20.00');
  expect(errors).toEqual([]);
});
