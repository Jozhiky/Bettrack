import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createCaptureQaServer } from './server.mjs';
const output = 'test-results/capture-upload';
await mkdir(output, { recursive: true });
const corpus = JSON.parse(await readFile('tests/ocr-phase4a/cases.json', 'utf8'));
const fixture = (id) => 'tests/ocr-phase4a/' + corpus.cases.find((c) => c.id === id).image;
const server = await createCaptureQaServer();
const blocked = [],
  errors = [],
  results = [];
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  for (const width of [375, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blocked.push(new URL(route.request().url()).origin);
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    await page.goto(origin);
    await expect(page.getByRole('button', { name: 'Subir capturas', exact: true })).toBeVisible();
    const uploads = () => page.evaluate(() => window.captureQa.uploads());
    const snapshot = () => page.evaluate(() => window.captureQa.snapshot());
    const idle = async (n) =>
      expect
        .poll(
          async () => {
            const rows = await uploads();
            return (
              rows.length === n && rows.every((u) => !['queued', 'processing'].includes(u.status))
            );
          },
          { timeout: 120000 },
        )
        .toBe(true);
    // Input selection invokes the real useCaptureInput, enqueueCaptures and queue.
    await page.getByLabel('Archivos de capturas').setInputFiles(fixture('team-shots-bournemouth'));
    await idle(1);
    let rows = await uploads();
    assert.equal(rows[0].status, 'review', rows[0].reason);
    assert.equal((await snapshot()).bets.length, 0);
    assert.equal((await snapshot()).movements.length, 0);
    const first = rows[0];
    const parsed = JSON.parse(first.draftJson);
    assert.equal(parsed.house, 'Betano');
    assert.equal(parsed.selections.length, 1);
    const card = page.locator('.capture-pending').first();
    await expect(card.locator('img')).toBeVisible();
    await card.locator('summary').filter({ hasText: 'Ver datos del boleto' }).click();
    await expect(card.getByText('Retorno potencial', { exact: true })).toBeVisible();
    // Synthetic fault, clearly separated from real OCR accuracy measurements.
    await page.evaluate((id) => window.captureQa.missingOdds(id), first.id);
    await card.getByRole('button', { name: 'Revisar datos', exact: true }).click();
    await page.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Faltan datos');
    await page.getByLabel('Cuota 1', { exact: true }).fill(String(parsed.selections[0].odds));
    await page.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar y registrar apuesta', exact: true }),
    ).toBeDisabled();
    assert.equal((await snapshot()).movements.length, 0);
    await page.screenshot({ path: `${output}/review-${width}.png`, fullPage: true });
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Confirmar y registrar apuesta', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.equal((await snapshot()).bets.length, 1);
    assert.equal((await snapshot()).movements.length, 1);
    assert.equal((await snapshot()).settlements.length, 0);
    // A renamed copy is rejected before another OCR/write.
    await page
      .getByLabel('Archivos de capturas')
      .setInputFiles({
        name: 'renamed.png',
        mimeType: 'image/png',
        buffer: await readFile(fixture('team-shots-bournemouth')),
      });
    await idle(2);
    assert.equal((await uploads()).filter((u) => u.status === 'duplicate').length, 1);
    await expect(page.getByRole('button', { name: 'Registrar como otra apuesta' })).toHaveCount(0);
    assert.equal((await snapshot()).movements.length, 1);
    // Actual browser encoders create JPEG/WebP from authorized deidentified pixels.
    const converted = await page.evaluate(
      async (url) => {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close();
        return ['image/jpeg', 'image/webp'].map(
          (type) => canvas.toDataURL(type, 0.98).split(',')[1],
        );
      },
      '/' + fixture('first-half-lech'),
    );
    await page.getByLabel('Archivos de capturas').setInputFiles([
      { name: 'qa.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(converted[0], 'base64') },
      { name: 'qa.webp', mimeType: 'image/webp', buffer: Buffer.from(converted[1], 'base64') },
      {
        name: 'broken.png',
        mimeType: 'image/png',
        buffer: Buffer.from('synthetic unreadable image'),
      },
      {
        name: 'lost-single-jablonec.png',
        mimeType: 'image/png',
        buffer: await readFile(fixture('lost-single-jablonec')),
      },
    ]);
    // Progress must be rendered while a real OCR worker processes the batch.
    await expect(
      page.getByRole('progressbar', { name: 'Progreso de lectura' }).first(),
    ).toBeVisible();
    await idle(6);
    rows = await uploads();
    assert.equal(rows.filter((u) => u.status === 'error').length, 1);
    assert.equal(rows.filter((u) => u.status === 'review').length, 3);
    assert.equal((await snapshot()).movements.length, 1);
    await expect(
      page.getByText('Boleto liquidado: Perdida', { exact: true }).first(),
    ).toBeVisible();
    const lost = page.locator('.capture-pending').filter({ hasText: 'lost-single-jablonec.png' });
    await lost.getByRole('button', { name: 'Revisar datos', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Completa fechas históricas');
    await expect(page.getByRole('button', { name: 'Confirmar e importar liquidada', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    // Restore a deliberately corrupt QA image and use the production retry button.
    const broken = rows.find((u) => u.status === 'error');
    await page.evaluate(({ id, url }) => window.captureQa.repairImage(id, url), {
      id: broken.id,
      url: '/' + fixture('first-half-juventus'),
    });
    await page
      .locator('.capture-pending')
      .filter({ hasText: 'broken.png' })
      .getByRole('button', { name: 'Mejorar lectura', exact: true })
      .click();
    await idle(6);
    assert.equal((await uploads()).find((u) => u.id === broken.id).status, 'review');
    // Reject unsupported file without creating a queue item.
    await page
      .getByLabel('Archivos de capturas')
      .setInputFiles({
        name: 'not-image.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('synthetic'),
      });
    await expect(
      page.getByRole('status').filter({ hasText: 'Usa PNG, JPEG o WebP' }),
    ).toBeVisible();
    assert.equal((await uploads()).length, 6);
    assert.equal((await snapshot()).movements.length, 1);
    assert.equal((await snapshot()).settlements.length, 0);
    // Simulate a transient storage failure: retry only this file, not the batch.
    await page.evaluate(() => window.captureQa.failUploadOnce('retry-only.png'));
    await page
      .getByLabel('Archivos de capturas')
      .setInputFiles({
        name: 'retry-only.png',
        mimeType: 'image/png',
        buffer: await readFile(fixture('team-goals-real-madrid')),
      });
    await expect(page.getByRole('region', { name: 'Capturas sin subir' })).toBeVisible();
    assert.equal((await uploads()).length, 6);
    await page.getByRole('button', { name: 'Reintentar subidas fallidas', exact: true }).click();
    await idle(7);
    await expect(page.getByRole('region', { name: 'Capturas sin subir' })).toHaveCount(0);
    assert.equal((await snapshot()).movements.length, 1);
    // Synthetic bet365 smoke test; it is NOT an admitted real bookmaker capture.
    const bet365 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 700;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 900, 700);
      ctx.fillStyle = 'black';
      ctx.font = '30px Arial';
      [
        'bet365',
        'BOLETO SINTETICO QA',
        'Simple',
        'Equipo Norte vs. Equipo Sur',
        'Ganador del partido',
        'Equipo Norte',
        'Cuota total 2.00',
        'Total de la apuesta S/ 10.00',
        'Retornos potenciales S/ 20.00',
        'Cerrar apuesta S/ 8.00',
      ].forEach((text, i) => ctx.fillText(text, 30, 55 + i * 60));
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page
      .getByLabel('Archivos de capturas')
      .setInputFiles({
        name: 'bet365-synthetic.png',
        mimeType: 'image/png',
        buffer: Buffer.from(bet365, 'base64'),
      });
    await idle(8);
    const synthetic = (await uploads()).find(
      (u) => !rows.some((r) => r.id === u.id) && JSON.parse(u.draftJson || '{}').house === 'Bet365',
    );
    assert(synthetic, 'Synthetic bet365 brand must be recognized');
    assert.equal(synthetic.status, 'review');
    assert.equal(JSON.parse(synthetic.draftJson).placement.status, 'unknown');
    assert.equal((await snapshot()).movements.length, 1);
    await expect(
      page
        .locator('.capture-pending')
        .filter({ hasText: 'bet365-synthetic.png' })
        .getByRole('button', { name: 'Revisar datos', exact: true }),
    ).toHaveCount(0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${output}/batch-${width}.png`, fullPage: true });
    results.push({
      width,
      realOcr: true,
      formats: ['PNG', 'JPEG', 'WebP'],
      individual: true,
      batch: true,
      progress: true,
      reviewCorrection: true,
      explicitConfirmation: true,
      duplicatesBlocked: true,
      settledBlocked: true,
      recoverableError: true,
      failedUploadRetry: true,
      syntheticBet365Held: true,
      horizontalOverflow: false,
    });
    await page.evaluate(() => window.captureQa.stop());
    await context.close();
    console.log(`Carga y revisión ${width}px: aprobadas`);
  }
  assert.deepEqual(blocked, []);
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ results, blocked, errors }, null, 2) + '\n',
  );
} finally {
  await browser?.close();
  await server.close();
}
