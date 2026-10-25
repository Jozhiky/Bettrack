import { chromium, expect as browserExpect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { configuration, api, qaOrigin } from './target.mjs';
import { server } from './server.mjs';

const config = await configuration(),
  owner = api(config),
  other = api(config);
for (const [client, account] of [
  [owner, config.accounts[0]],
  [other, config.accounts[1]],
]) {
  const login = await client.auth.signInWithPassword(account);
  assert.ifError(login.error);
  assert.equal(login.data.user.id, account.id);
}
const snapshot = async (client = owner) => {
  const result = await client.rpc('bt_snapshot');
  assert.ifError(result.error);
  return result.data;
};
// Only the allowlisted disposable QA account. No production target is accepted.
const initial = await snapshot(),
  clear = Object.entries(initial.records).flatMap(([collection, rows]) =>
    collection === 'audit' ? [] : rows.map((row) => ({ collection, id: row.id, payload: null })),
  );
if (clear.length)
  assert.ifError(
    (await owner.rpc('bt_commit', { expected_version: initial.version, changes: clear })).error,
  );
const app = await server(),
  browser = await chromium.launch();
const expect = browserExpect.configure({ timeout: 90000 }),
  out = 'test-results/automatic-registration-qa';
const passed = [],
  errors = [],
  blocked = [],
  financial = [];
await mkdir(out, { recursive: true });
try {
  const session = async () => {
    const context = await browser.newContext({
      baseURL: app.origin,
      serviceWorkers: 'block',
      viewport: { width: 1440, height: 950 },
    });
    await context.route('**/*', (route) => {
      if ([app.origin, qaOrigin].includes(new URL(route.request().url()).origin))
        return route.continue();
      blocked.push(new URL(route.request().url()).origin);
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => {
      if (request.url() === qaOrigin + '/rest/v1/rpc/bt_commit') {
        const packet = request.postDataJSON();
        if (packet.changes.some((c) => ['bets', 'settlements', 'movements'].includes(c.collection)))
          financial.push(packet);
      }
    });
    await page.goto('/apuestas');
    await page.getByLabel('Usuario', { exact: true }).fill(config.accounts[0].username);
    await page.getByLabel('Contraseña', { exact: true }).fill(config.accounts[0].password);
    await page.getByRole('button', { name: 'Entrar a BETTRACK', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible();
    return { page, context };
  };
  const a = await session();
  const image = async (kind, reference, format = 'png', returned = '15.00', variant = '') => {
    const text = [
      'Betano',
      `Simple S/10.00 ${kind === 'Pendiente' ? '2.00' : kind === 'Cashout' ? 'Cash Out' : kind}`,
      'Más de 2.5',
      'Goles totales Más/Menos',
      'Equipo QA',
      'Equipo QB',
      'Apuesta S/10.00',
      kind === 'Pendiente'
        ? 'Ganancias potenciales S/20.00\nCASH OUT S/7.00'
        : kind === 'Perdida'
          ? ''
          : `Ganancias S/${returned}`,
      `ID de apuesta: ${reference}`,
      ...(kind === 'Pendiente' ? ['Apuesta aceptada'] : []),
      variant,
    ]
      .filter(Boolean)
      .join('\n');
    const buffer = Buffer.from(
      await a.page.evaluate(
        ({ text, format }) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1000;
          canvas.height = 1050;
          const x = canvas.getContext('2d');
          x.fillStyle = 'white';
          x.fillRect(0, 0, 1000, 1050);
          x.fillStyle = 'black';
          x.font = 'bold 30px Arial';
          const lines = text.split('\n');
          lines.forEach((line, index) => {
            x.fillText(
              line,
              ['Más de 2.5', 'Goles totales Más/Menos', 'Equipo QA', 'Equipo QB'].includes(line)
                ? 180
                : 30,
              50 + index * 65,
            );
            if (line === 'Más de 2.5') x.fillText('2.00', 850, 50 + index * 65);
          });
          return canvas
            .toDataURL('image/' + (format === 'jpg' ? 'jpeg' : format), 0.98)
            .split(',')[1];
        },
        { text, format },
      ),
      'base64',
    );
    return {
      name: `synthetic-${reference}-${kind}.${format}`,
      mimeType: 'image/' + (format === 'jpg' ? 'jpeg' : format),
      buffer,
    };
  };
  const upload = async (page, files) => {
    const before = (await snapshot()).records.uploads.length;
    await page.locator('input[type=file][multiple]').setInputFiles(files);
    await expect
      .poll(async () => (await snapshot()).records.uploads.length)
      .toBe(before + (Array.isArray(files) ? files.length : 1));
  };
  const finished = async () =>
    expect
      .poll(
        async () =>
          (await snapshot()).records.uploads.filter((u) =>
            ['queued', 'processing'].includes(u.status),
          ).length,
        { timeout: 150000 },
      )
      .toBe(0);
  await upload(a.page, await image('Ganada', 'QAOLD0001'));
  await finished();
  assert.equal((await snapshot()).records.bets.length, 0);
  assert.equal(financial.length, 0);
  passed.push(
    'Default manual mode: upload/OCR creates no financial write before standing authorization',
  );
  console.log('QA: manual upload passed');
  await a.page.goto('/configuracion');
  await a.page
    .getByRole('button', { name: 'Activar y autorizar registro automático', exact: true })
    .click();
  await expect(
    a.page.getByRole('button', { name: 'Desactivar registro automático', exact: true }),
  ).toBeVisible();
  const policy = (await snapshot()).records.settings[0].automaticCaptures;
  console.log('QA: policy activated');
  assert.equal(policy.ownerId, config.accounts[0].id);
  await a.page.goto('/apuestas');
  const pending = await image('Pendiente', 'QAAUTO001');
  await upload(a.page, pending);
  await finished();
  let s = await snapshot();
  await writeFile(
    out + '/first-result.json',
    JSON.stringify(
      s.records.uploads.map((u) => ({
        status: u.status,
        reason: u.reason,
        draft: JSON.parse(u.draftJson || '{}'),
      })),
      null,
      2,
    ),
  );
  assert.equal(s.records.bets.length, 1);
  assert.equal(s.records.movements.length, 1);
  assert.equal(s.records.settlements.length, 0);
  assert.equal(s.records.bets[0].ticketReference, 'QAAUTO001');
  assert.equal(s.records.uploads.find((u) => u.status === 'review').betId, undefined);
  passed.push(
    'One-time account authorization: new pending PNG automatically creates one stake, old draft remains untouched',
  );
  console.log('QA: pending automatically recorded');
  const b = await session();
  await upload(a.page, [
    await image('Ganada', 'QAAUTO002', 'jpg'),
    await image('Perdida', 'QAAUTO003', 'webp'),
    await image('Cashout', 'QAAUTO004', 'png', '14.00'),
    await image('Cashout', 'QAAUTO005', 'png', '7.00'),
    await image('Cashout', 'QAAUTO111', 'png', '10.00'),
  ]);
  await finished();
  s = await snapshot();
  await writeFile(
    out + '/batch-result.json',
    JSON.stringify(
      s.records.uploads.map((u) => ({
        status: u.status,
        reason: u.reason,
        draft: JSON.parse(u.draftJson || '{}'),
      })),
      null,
      2,
    ),
  );
  assert.equal(s.records.bets.length, 6);
  assert.equal(s.records.settlements.length, 5);
  assert.equal(s.records.movements.length, 11);
  assert.equal(
    s.records.settlements.reduce((n, x) => n + x.returned - x.closedStake, 0),
    -400,
  );
  assert.equal(s.records.settlements.filter((x) => x.kind === 'Cashout').length, 3);
  assert(
    s.records.audit
      .filter((x) => x.action === 'Registro automático de captura')
      .every((x) => JSON.parse(x.after).acknowledged === false),
  );
  passed.push(
    'Real local Tesseract + multi-upload PNG/JPEG/WebP: win/loss and profitable/loss/neutral cashout booked atomically, net -4',
  );
  let lost = false;
  await a.context.route(qaOrigin + '/rest/v1/rpc/bt_commit', async (route) => {
    if (
      !lost &&
      route
        .request()
        .postDataJSON()
        .changes.some((c) => c.collection === 'settlements' && c.payload)
    ) {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await upload(a.page, await image('Ganada', 'QAAUTO001', 'png', '15.00', 'Resultado posterior'));
  await finished();
  s = await snapshot();
  assert(lost);
  assert.equal(s.records.bets.length, 6);
  assert.equal(s.records.settlements.length, 6);
  assert.equal(s.records.movements.length, 12);
  const repeat = await image('Ganada', 'QAAUTO001', 'png', '15.00', 'Copia posterior');
  await upload(a.page, repeat);
  await finished();
  await upload(a.page, repeat);
  await finished();
  s = await snapshot();
  assert.equal(s.records.movements.length, 12);
  passed.push(
    'Later screenshot settles same explicit reference without new stake; lost response, different image and identical reupload remain idempotent',
  );
  const concurrentA = await image('Ganada', 'QAAUTO001', 'png', '15.00', 'Copia A');
  const concurrentB = await image('Ganada', 'QAAUTO001', 'png', '15.00', 'Copia B');
  const beforeConcurrent = (await snapshot()).records.uploads.length;
  await Promise.all([
    a.page.locator('input[type=file][multiple]').setInputFiles(concurrentA),
    b.page.locator('input[type=file][multiple]').setInputFiles(concurrentB),
  ]);
  await expect
    .poll(async () => (await snapshot()).records.uploads.length)
    .toBe(beforeConcurrent + 2);
  await finished();
  s = await snapshot();
  assert.equal(s.records.bets.length, 6);
  assert.equal(s.records.movements.length, 12);
  assert.equal(s.records.uploads.filter((u) => u.status === 'error').length, 0);
  passed.push(
    'Two simultaneous sessions upload different copies of one reference: conflicts recover without duplicate financial entries',
  );
  await upload(a.page, await image('Cashout', 'QAAUTO007', 'png', 'ilegible'));
  await finished();
  s = await snapshot();
  assert.equal(s.records.bets.length, 6);
  assert.equal(s.records.movements.length, 12);
  assert(
    s.records.uploads.some(
      (u) => u.status === 'review' && JSON.parse(u.draftJson).ticketReference === 'QAAUTO007',
    ),
  );
  passed.push('Unreadable actual return remains a preserved draft without movements');
  let uploadFailed = false;
  await a.context.route(qaOrigin + '/storage/v1/object/bettrack-captures/**', async (route) => {
    if (!uploadFailed && route.request().method() === 'POST') {
      uploadFailed = true;
      await route.abort();
    } else await route.continue();
  });
  const financesBeforeFailure = financial.length;
  await a.page
    .locator('input[type=file][multiple]')
    .setInputFiles(await image('Ganada', 'QAAUTO009'));
  await expect(a.page.getByRole('region', { name: 'Capturas sin subir' })).toBeVisible();
  assert(uploadFailed);
  assert.equal(financial.length, financesBeforeFailure);
  const beforeRetry = (await snapshot()).records.uploads.length;
  await a.page.getByRole('button', { name: 'Reintentar subidas fallidas', exact: true }).click();
  await expect.poll(async () => (await snapshot()).records.uploads.length).toBe(beforeRetry + 1);
  await finished();
  s = await snapshot();
  assert.equal(s.records.bets.length, 7);
  assert.equal(s.records.settlements.length, 7);
  assert.equal(s.records.movements.length, 14);
  passed.push(
    'Failed private Storage upload writes no money; retry uploads once and automatically records one complete final wager',
  );
  for (const ctx of [a, b]) {
    await ctx.page.reload();
    await ctx.page.goto('/configuracion');
    await expect(
      ctx.page.getByRole('button', { name: 'Desactivar registro automático', exact: true }),
    ).toBeVisible();
    await ctx.page.goto('/');
    await expect(ctx.page.locator('.kpi').filter({ hasText: 'Resultado neto' })).toContainText(
      '6.00',
    );
  }
  const privatePath = s.records.images[0].path;
  assert.ifError((await owner.storage.from('bettrack-captures').download(privatePath)).error);
  assert((await other.storage.from('bettrack-captures').download(privatePath)).error);
  assert.equal((await snapshot(other)).records.bets.length, 0);
  assert.equal((await snapshot(other)).records.settings[0]?.automaticCaptures, undefined);
  passed.push(
    'Two-session reload/settings/dashboard agree; private image retrieval and account isolation verified',
  );
  await a.page.goto('/configuracion');
  for (const width of [375, 768, 1440]) {
    await a.page.setViewportSize({ width, height: 950 });
    await expect(
      a.page.getByRole('button', { name: 'Desactivar registro automático', exact: true }),
    ).toBeVisible();
    assert(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await a.page.screenshot({ path: `${out}/settings-${width}.png` });
  }
  await a.page.getByRole('button', { name: 'Desactivar registro automático', exact: true }).click();
  await expect(
    a.page.getByRole('button', { name: 'Activar y autorizar registro automático', exact: true }),
  ).toBeVisible();
  await b.page.reload();
  await b.page.goto('/configuracion');
  await expect(
    b.page.getByRole('button', { name: 'Activar y autorizar registro automático', exact: true }),
  ).toBeVisible();
  await a.page.goto('/apuestas');
  await upload(a.page, await image('Ganada', 'QAAUTO008'));
  await finished();
  s = await snapshot();
  assert.equal(s.records.bets.length, 7);
  assert.equal(s.records.movements.length, 14);
  passed.push(
    'Responsive desktop/tablet/mobile; disabling synchronizes and stops future automatic financial writes',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  await writeFile(
    out + '/report.json',
    JSON.stringify(
      {
        passed,
        counts: {
          bets: s.records.bets.length,
          settlements: s.records.settlements.length,
          movements: s.records.movements.length,
        },
        errors,
        blocked,
        productionRequests: 0,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed }, null, 2));
} catch (error) {
  console.error(error);
  const s = await snapshot();
  await writeFile(
    out + '/failure.json',
    JSON.stringify({ passed, errors, blocked, financial, uploads: s.records.uploads }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  app.instance.closeAllConnections();
  await new Promise((resolve) => app.instance.close(resolve));
  await owner.auth.signOut();
  await other.auth.signOut();
}
