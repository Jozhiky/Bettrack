import { test, expect } from '@playwright/test';
import path from 'node:path';

// Opt-in regression using the user's local originals. Files are never uploaded
// to an external host or saved as bets in the user's browser profile.
const directory = process.env.BETTRACK_TICKET_DIR;
const cases = [
  { file: 'bet (27).png', count: 1, stake: '7', odds: '1.44', potential: '10.08', builders: 0 },
  { file: 'bet (23).png', count: 11, stake: '1.5', odds: '46', potential: '69.01', builders: 16 },
  { file: 'bet (21).png', count: 18, stake: '1.5', odds: '61.62', potential: '92.43', builders: 0 },
  {
    file: 'bet (20).png',
    count: 22,
    stake: '1.1',
    odds: '717.29',
    potential: '789.02',
    builders: 10,
    promos: 12,
  },
  {
    file: 'bet (11).png',
    count: 12,
    stake: '1',
    odds: '95518.2',
    potential: '95518.2',
    builders: 0,
    promos: 12,
  },
  {
    file: 'bet (18).png',
    count: 12,
    stake: '5',
    odds: '22.46',
    potential: '112.32',
    builders: 2,
    promos: 4,
  },
];
for (const ticket of cases)
  test(`Betano real: ${ticket.file}`, async ({ page }) => {
    test.skip(!directory, 'Set BETTRACK_TICKET_DIR to the folder containing the three originals.');
    const external: string[] = [];
    page.on('request', (r) => {
      if (!/^(http:\/\/127\.0\.0\.1:5189|blob:|data:)/.test(r.url())) external.push(r.url());
    });
    await page.goto('/capturas');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles(path.join(directory!, ticket.file));
    await expect(page.locator('.bet-card')).toHaveCount(1, {
      timeout: 90000,
    });
    await page.getByRole('button', { name: 'Ver detalle' }).click();
    await page.getByRole('button', { name: 'Editar apuesta', exact: true }).click();
    await expect(page.locator('.selection-form')).toHaveCount(ticket.count);
    await expect(page.getByLabel('Monto apostado')).toHaveValue(ticket.stake);
    await expect(page.getByLabel('Cuota total')).toHaveValue(ticket.odds);
    await expect(page.getByLabel('Retorno potencial')).toHaveValue(ticket.potential);
    await expect(page.getByLabel('Fecha y hora · Lima')).not.toHaveValue('');
    await expect(page.locator('.builder-market')).toHaveCount(ticket.builders);
    for (const input of await page.getByLabel('Evento / equipos').all())
      expect(await input.inputValue()).toContain(' vs. ');
    if (ticket.file === 'bet (23).png') {
      await expect(
        page.locator('.selection-form').nth(8).getByLabel('Mercado interno 1'),
      ).toHaveValue('Más/Menos Goles en Primer Tiempo');
      await expect(
        page.locator('.selection-form').nth(10).getByLabel('Selección interna 2'),
      ).toHaveValue('1-4');
      await expect(
        page.locator('.selection-form').nth(10).getByLabel('Selección interna 4'),
      ).toHaveValue('Si');
      const child = page.locator('.selection-form').nth(3).getByLabel('Selección interna 1');
      await child.fill('Más de 1.5');
      await expect(child).toHaveValue('Más de 1.5');
    }
    if (ticket.promos) {
      const promos = await page
        .locator('select[name$="promotion"]')
        .evaluateAll(
          (elements) =>
            elements.filter((el) => (el as HTMLSelectElement).value === 'Pago anticipado +2')
              .length,
        );
      expect(promos).toBe(ticket.promos);
    }
    if (ticket.file === 'bet (11).png') {
      await expect(page.getByLabel('Bono potencial mostrado')).toHaveValue('47758.6');
      await expect(page.getByLabel('Relación del bono')).toHaveValue('Sin confirmar');
      await expect(
        page.locator('.selection-form').nth(6).getByLabel('Cuota individual'),
      ).toHaveValue('2.3');
    }
    if (ticket.file === 'bet (18).png') {
      await expect(page.locator('.selection-form').nth(1).getByLabel('Mercado exacto')).toHaveValue(
        'Ambos equipos anotan',
      );
      await expect(page.locator('.selection-form').nth(2).getByLabel('Mercado exacto')).toHaveValue(
        'Ambos equipos reciben una tarjeta',
      );
    }
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/betano-${ticket.file.replace(/\D/g, '')}-${width}.png`,
        fullPage: true,
      });
    }
    expect(external).toEqual([]);
  });

test('recorte real de jugador: 1+ y Suplente de Oro, sin inventar boleto', async ({ page }) => {
  const file = process.env.BETTRACK_FRAGMENT_PATH;
  test.skip(!file, 'Set BETTRACK_FRAGMENT_PATH to the original player-market crop.');
  await page.goto('/capturas');
  await page.locator('input[type=file]').first().setInputFiles(file!);
  await expect(page.locator('.capture-card[data-status=review]')).toHaveCount(1, {
    timeout: 90000,
  });
  await expect(
    page.getByText('Faltan casa, monto, cuota o retorno.', { exact: false }),
  ).toBeVisible();
  await page.goto('/apuestas');
  await expect(page.locator('tbody tr')).toHaveCount(0);
});
