import { test, expect, type Page } from '@playwright/test';

async function seedHistory(page: Page) {
  await page.goto('/apuestas');
  await expect(page.getByRole('heading', { name: 'Mis apuestas' })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('bettrack-local-v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['bets', 'selections', 'movements', 'settlements'], 'readwrite');
        tx.objectStore('movements').put({
          id: 'ux-capital',
          date: '2026-10-14T12:00:00.000Z',
          houseId: 'house-0',
          kind: 'Capital inicial',
          amount: 100000,
          note: '',
        });
        for (let i = 0; i < 30; i++) {
          const id = 'ux-bet-' + String(i).padStart(2, '0');
          const date = new Date(Date.UTC(2026, 9, 15, 12, i)).toISOString();
          tx.objectStore('bets').put({
            id,
            date,
            houseId: 'house-0',
            streamerId: '',
            kind: 'Combinada',
            live: false,
            odds: 2,
            stake: 1000,
            potential: 2000,
            notes: '',
            source: 'manual',
            fingerprint: id,
            createdAt: date,
            updatedAt: date,
          });
          tx.objectStore('movements').put({
            id: 'stake-' + id,
            date,
            houseId: 'house-0',
            kind: 'Apuesta colocada',
            amount: -1000,
            betId: id,
            note: '',
          });
          for (let j = 0; j < 2; j++)
            tx.objectStore('selections').put({
              id: id + '-' + j,
              betId: id,
              order: j,
              event: `Club ${i}-${j} vs. Visitante`,
              sport: 'Fútbol',
              league: '',
              market: j ? 'Goles' : 'Bet Builder',
              pick: 'Más de 1.5',
              odds: 1.4,
              builderMarkets: j
                ? []
                : [
                    { market: 'Goles', pick: 'Más de 1.5' },
                    { market: 'Córners', pick: 'Más de 6.5' },
                  ],
            });
          if (i < 2) {
            const settledDate = i ? '2026-10-16T19:00:00.000Z' : '2026-10-15T19:00:00.000Z';
            const returned = i ? 0 : 2000;
            tx.objectStore('settlements').put({
              id: 'result-' + id,
              betId: id,
              date: settledDate,
              kind: i ? 'Perdida' : 'Ganada',
              closedStake: 1000,
              returned,
              note: '',
            });
            tx.objectStore('movements').put({
              id: 'return-' + id,
              date: settledDate,
              houseId: 'house-0',
              kind: 'Apuesta liquidada',
              amount: returned,
              betId: id,
              settlementId: 'result-' + id,
              note: '',
            });
          }
        }
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
}

test('historial conserva filtros, página, vista y posición al consultar un boleto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await seedHistory(page);
  await page.getByRole('button', { name: /Todas \(/ }).click();
  await page.getByPlaceholder('Buscar partido, mercado o referencia…').fill('Club');
  await page.locator('.workspace-filter-menu > summary').click();
  await page.getByLabel('Filtrar tipo').selectOption('Combinada');
  await page.keyboard.press('Escape');
  await page.getByLabel('Ordenar apuestas').selectOption('old');
  const nav = page.getByRole('navigation', { name: 'Paginación de boletos' });
  await nav.getByLabel('boletos por página').selectOption('6');
  await nav.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(nav).toContainText('Página 2 de 5');
  const first = page.locator('.bet-card').first();
  await expect(first).toContainText('Combinada · 2 partidos');
  await expect(first).toContainText('2 partidos · 3 mercados');
  await first.locator('summary').click();
  await expect(first.locator('li')).toHaveCount(2);
  await expect(first).toContainText('Más de 6.5 · Córners');
  await first.getByRole('button', { name: 'Ver detalle', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveClass(/detail-modal/);
  const bounds = (await dialog.boundingBox())!;
  expect(Math.abs(bounds.x + bounds.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
  await page.keyboard.press('Escape');
  await expect(first.getByRole('button', { name: 'Ver detalle', exact: true })).toBeFocused();
  const viewport = page.locator('.workspace-scroll');
  const scroll = await viewport.evaluate((el) => el.scrollTop);
  await page.locator('.sidebar').getByRole('link', { name: 'Banca y movimientos' }).click();
  await page.locator('.sidebar').getByRole('link', { name: 'Mis apuestas' }).click();
  await expect(nav).toContainText('Página 2 de 5');
  await expect(page.getByLabel('Buscar apuestas')).toHaveValue('Club');
  await expect(page.getByLabel('Filtrar tipo')).toHaveValue('Combinada');
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(Math.max(0, scroll - 150));
  await page.getByRole('button', { name: 'Tabla', exact: true }).click();
  await page.reload();
  await expect(page.locator('.history-table tbody tr')).toHaveCount(6);
  await expect(nav).toContainText('Página 2 de 5');
  await page.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await viewport.evaluate((el) => el.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/ux-history-${width}.png` });
    await first.getByRole('button', { name: 'Ver detalle', exact: true }).click();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/ux-detail-${width}.png` });
    await page.keyboard.press('Escape');
  }
});

test('dashboard distingue banca global, beneficio acumulado y último resultado diario', async ({
  page,
}) => {
  await seedHistory(page);
  await page.goto('/');
  await expect(page.locator('.chart-value strong')).toHaveText('S/ 0.00');
  await page.getByLabel('Métrica del gráfico').selectOption('profit');
  await expect(page.locator('.chart-value')).toContainText('16/10');
  await expect(page.locator('.chart-value strong')).toHaveText('-S/ 10.00');
  await page.getByLabel('Métrica del gráfico').selectOption('bank');
  await expect(page.locator('.chart-value strong')).toHaveText('S/ 1,000.00');
  await page.getByLabel('Filtrar casa').selectOption('house-1');
  await expect(page.locator('.chart-value strong')).toHaveText('S/ 1,000.00');
  await expect(page.locator('.bank-overview')).toContainText('S/ 1,000.00');
  await expect(page.getByLabel('Filtros activos')).toContainText('Bet365');
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(page.getByLabel('Filtrar casa')).toHaveValue('');
});

test('cashout muestra errores junto al campo y el aviso no cubre las acciones', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 950 });
  await seedHistory(page);
  await page.getByRole('button', { name: 'Cashout', exact: true }).first().click();
  await page.getByLabel('Monto cobrado').fill('-5');
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('negativo');
  await page.getByLabel('Monto cobrado').fill('6');
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const dock = await page.locator('.feedback-dock').boundingBox();
  const work = await page.locator('.workspace-scroll').boundingBox();
  const navigation = await page.getByRole('navigation', { name: 'Navegación móvil' }).boundingBox();
  expect(dock!.y).toBeGreaterThanOrEqual(work!.y + work!.height - 1);
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(navigation!.y + 1);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pendientes (28)', exact: true })).toBeVisible();
});

test('un error de guardado permanece visible dentro del formulario hasta corregirlo', async ({
  page,
}) => {
  await seedHistory(page);
  await page.goto('/banca');
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await page.getByLabel('Tipo de movimiento').selectOption('Retiro');
  await page.getByLabel('Importe', { exact: true }).fill('100000');
  await page.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Saldo insuficiente');
  await page.getByLabel('Importe', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.feedback-dock')).toContainText('Guardado');
});
