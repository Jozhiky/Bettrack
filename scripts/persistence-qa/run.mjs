import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { configuration, api, qaOrigin } from './target.mjs';
import { server } from './server.mjs';
const config = await configuration();
const owner = api(config),
  stranger = api(config),
  anonymous = api(config);
for (const [client, account] of [
  [owner, config.accounts[0]],
  [stranger, config.accounts[1]],
]) {
  const result = await client.auth.signInWithPassword(account);
  assert.ifError(result.error);
  assert.equal(result.data.user.id, account.id);
}
const snapshot = async (client = owner) => {
  const r = await client.rpc('bt_snapshot');
  assert.ifError(r.error);
  return r.data;
};
// Only the two generated fixture accounts in the allowlisted QA project.
// This runner never imports the legacy production cloud-qa script.
for (const client of [owner, stranger]) {
  const before = await snapshot(client);
  const changes = Object.entries(before.records).flatMap(([collection, rows]) =>
    collection === 'audit' ? [] : rows.map((row) => ({ collection, id: row.id, payload: null })),
  );
  if (changes.length)
    assert.ifError(
      (await client.rpc('bt_commit', { expected_version: before.version, changes })).error,
    );
  const pending = await client.from('bt_storage_cleanup').select('path');
  assert.ifError(pending.error);
  if (pending.data.length) {
    const paths = pending.data.map((row) => row.path);
    assert.ifError((await client.storage.from('bettrack-captures').remove(paths)).error);
    assert.ifError((await client.from('bt_storage_cleanup').delete().in('path', paths)).error);
  }
}
await mkdir('test-results/persistence-qa', { recursive: true });
const output = 'test-results/persistence-qa';
const results = [],
  blocked = [],
  errors = [];
const passed = (...checks) => {
  results.push(...checks);
  checks.forEach((check) => console.log('PASS: ' + check));
};
const app = await server();
let browser;
try {
  browser = await chromium.launch();
  const context = async () => {
    const c = await browser.newContext({
      baseURL: app.origin,
      serviceWorkers: 'block',
      viewport: { width: 1440, height: 950 },
    });
    await c.route('**/*', (route) => {
      const origin = new URL(route.request().url()).origin;
      if ([app.origin, qaOrigin].includes(origin)) return route.continue();
      blocked.push(origin);
      return route.abort();
    });
    const p = await c.newPage();
    p.setDefaultTimeout(60000);
    p.on('pageerror', (e) => errors.push(e.message));
    return { c, p };
  };
  const a = await context(),
    b = await context(),
    other = await context();
  const login = async (p, index) => {
    await p.goto('/apuestas');
    await p.getByLabel('Usuario', { exact: true }).fill(config.accounts[index].username);
    await p.getByLabel('Contraseña', { exact: true }).fill(config.accounts[index].password);
    await p.getByRole('button', { name: 'Entrar a BETTRACK', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible({
      timeout: 60000,
    });
  };
  await login(a.p, 0);
  await login(b.p, 0);
  await login(other.p, 1);
  assert.equal((await snapshot(stranger)).records.bets.length, 0);
  passed('login and account isolation');
  // All pixels/text below are synthetic QA evidence, never real betting slips.
  const image = async (p, event, type = 'image/png', footer = 'Apuesta confirmada') => {
    const base64 = await p.evaluate(
      ({ event, type, footer }) => {
        const c = document.createElement('canvas');
        c.width = 1000;
        c.height = 1000;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = 'black';
        ctx.font = '36px Arial';
        [
          'BETANO',
          'Apuesta Simple',
          event,
          'Goles del partido',
          'Mas de 2.5',
          '2.00',
          'Cuota total: 2.00',
          'Importe apostado S/ 10.00',
          'Retorno potencial S/ 20.00',
          footer,
        ].forEach((text, i) => ctx.fillText(text, 50, 80 + i * 95));
        return c.toDataURL(type, 0.98).split(',')[1];
      },
      { event, type, footer },
    );
    return {
      name: `synthetic-${type.split('/')[1]}.${type.split('/')[1]}`,
      mimeType: type,
      buffer: Buffer.from(base64, 'base64'),
    };
  };
  const upload = (p, files) =>
    p.getByLabel('Archivos de capturas', { exact: true }).setInputFiles(files);
  const idle = async (n) =>
    expect
      .poll(
        async () => {
          const rows = (await snapshot()).records.uploads;
          return (
            rows.length === n && rows.every((u) => !['queued', 'processing'].includes(u.status))
          );
        },
        { timeout: 180000 },
      )
      .toBe(true);
  const confirm = async (p) => {
    await p.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
    await expect(
      p.getByRole('button', { name: 'Confirmar y registrar apuesta', exact: true }),
    ).toBeDisabled();
    await p.getByRole('checkbox').check();
    await p.getByRole('button', { name: 'Confirmar y registrar apuesta', exact: true }).click();
    await expect(p.getByRole('dialog')).toHaveCount(0, { timeout: 60000 });
  };
  const png = await image(a.p, 'Equipo Norte vs Equipo Sur', 'image/png', 'CASH OUT S/ 8.00');
  await upload(a.p, png);
  await idle(1);
  let s = await snapshot();
  assert.equal(s.records.bets.length, 0);
  assert.equal(s.records.movements.length, 0);
  assert.equal(s.records.uploads[0].status, 'review');
  const draft = JSON.parse(s.records.uploads[0].draftJson);
  assert.equal(draft.house, 'Betano');
  assert.equal(draft.cashoutOffer, 800);
  assert.equal(draft.selections.length, 1);
  await a.p
    .locator('.capture-pending')
    .getByRole('button', { name: 'Revisar datos', exact: true })
    .click();
  // Deliberate literal correction of spacing, visible in the synthetic image.
  await a.p.getByLabel('Evento 1', { exact: true }).fill('Equipo Norte vs. Equipo Sur');
  await confirm(a.p);
  s = await snapshot();
  assert.equal(s.records.bets.length, 1);
  assert.equal(s.records.selections.length, 1);
  assert.equal(s.records.movements.length, 1);
  assert.equal(s.records.movements[0].amount, -1000);
  assert.equal(s.records.settlements.length, 0);
  const bet = s.records.bets[0],
    originalImage = s.records.images[0];
  assert.equal(s.records.selections[0].event, 'Equipo Norte vs. Equipo Sur');
  const download = await owner.storage.from('bettrack-captures').download(originalImage.path);
  assert.ifError(download.error);
  assert(download.data.size > 0);
  assert((await stranger.storage.from('bettrack-captures').download(originalImage.path)).error);
  assert((await anonymous.storage.from('bettrack-captures').download(originalImage.path)).error);
  const publicResult = await fetch(
    `${qaOrigin}/storage/v1/object/public/bettrack-captures/${originalImage.path}`,
  );
  assert(!publicResult.ok);
  assert((await anonymous.rpc('bt_snapshot')).error);
  assert((await anonymous.rpc('bt_commit', { expected_version: 0, changes: [] })).error);
  const foreignRows = await stranger
    .from('bt_bets')
    .select('id')
    .eq('user_id', config.accounts[0].id);
  assert.ifError(foreignRows.error);
  assert.equal(foreignRows.data.length, 0);
  passed(
    'private Storage upload/download and cross-account/anonymous denial',
    'exact reviewed selections and one stake movement, no realized cashout',
  );
  await a.p.reload();
  await expect(a.p.locator('.bet-card')).toHaveCount(1, { timeout: 60000 });
  await expect(b.p.locator('.bet-card')).toHaveCount(1, { timeout: 60000 });
  await expect(other.p.locator('.bet-card')).toHaveCount(0);
  await b.p.getByRole('button', { name: 'Ver detalle', exact: true }).click();
  await b.p.getByRole('button', { name: 'Ver captura', exact: true }).click();
  await expect(b.p.getByRole('dialog').locator('img').first()).toBeVisible();
  await b.p.getByRole('button', { name: 'Cerrar', exact: true }).click();
  assert.equal((await snapshot()).records.bets[0].id, bet.id);
  passed('page reload preserves ids, second session receives bet and retrieves image');
  // Same pixels in both sessions, concurrently: no duplicate finances.
  await Promise.all([
    upload(a.p, { ...png, name: 'renamed-one.png' }),
    upload(b.p, { ...png, name: 'renamed-two.png' }),
  ]);
  for (const p of [a.p, b.p])
    await expect(p.getByRole('button', { name: 'Subir capturas', exact: true })).toBeVisible({
      timeout: 60000,
    });
  await expect
    .poll(
      async () => (await snapshot()).records.uploads.filter((u) => u.status === 'duplicate').length,
      { timeout: 60000 },
    )
    .toBeGreaterThanOrEqual(1);
  s = await snapshot();
  assert.equal(s.records.bets.length, 1);
  assert.equal(s.records.movements.length, 1);
  passed('concurrent identical capture attempts cannot create a second charge');
  for (const p of [a.p, b.p])
    if (await p.getByRole('button', { name: 'Descartar fallidas', exact: true }).count())
      await p.getByRole('button', { name: 'Descartar fallidas', exact: true }).click();
  let n = s.records.uploads.length;
  const jpg = await image(a.p, 'Equipo Este vs Equipo Oeste', 'image/jpeg');
  const webp = await image(a.p, 'Equipo Azul vs Equipo Rojo', 'image/webp');
  await upload(a.p, [jpg, webp]);
  n += 2;
  await idle(n);
  s = await snapshot();
  assert.equal(s.records.bets.length, 1);
  assert.equal(s.records.movements.length, 1);
  assert(s.records.images.some((i) => i.name.endsWith('.jpeg')));
  assert(s.records.images.some((i) => i.name.endsWith('.webp')));
  passed('JPEG/WebP batch persisted as separate review drafts');
  // Network outage before upload must not produce a financial or image record.
  const offline = await image(a.p, 'Equipo Sol vs Equipo Luna');
  const beforeOffline = await snapshot();
  await a.c.setOffline(true);
  await upload(a.p, offline);
  await expect(a.p.getByRole('alert').filter({ hasText: '0 capturas recibidas' })).toBeVisible({
    timeout: 30000,
  });
  console.log(
    'Failed upload controls: ' +
      (await a.p.locator('section[aria-label="Capturas sin subir"]').count()),
  );
  await a.p.screenshot({ path: `${output}/offline-debug.png`, fullPage: true });
  await expect(a.p.getByRole('region', { name: 'Capturas sin subir' })).toBeVisible();
  assert.deepEqual((await snapshot()).records, beforeOffline.records);
  await a.c.setOffline(false);
  await a.p.getByRole('button', { name: 'Reintentar subidas fallidas', exact: true }).click();
  n++;
  await idle(n);
  assert.equal((await snapshot()).records.movements.length, 1);
  passed('offline upload fails without writes, retry stores only the failed capture');
  const failedFile = await image(a.p, 'Equipo Bosque vs Equipo Mar');
  let uploadFailure = false;
  await a.p.route(`${qaOrigin}/storage/v1/object/bettrack-captures/**`, async (route) => {
    if (route.request().method() === 'POST' && !uploadFailure) {
      uploadFailure = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: '503',
          error: 'Synthetic QA upload failure',
          message: 'Retry QA',
        }),
      });
      return;
    }
    await route.continue();
  });
  await upload(a.p, failedFile);
  await expect(a.p.getByRole('region', { name: 'Capturas sin subir' })).toBeVisible({
    timeout: 30000,
  });
  assert.equal((await snapshot()).records.uploads.length, n);
  await a.p.getByRole('button', { name: 'Reintentar subidas fallidas', exact: true }).click();
  n++;
  await idle(n);
  assert(uploadFailure);
  assert.equal((await snapshot()).records.movements.length, 1);
  passed('Storage 503 retries one failed file with no premature financial write');
  // Simulate a lost response after the server has accepted a final confirmation.
  const review = a.p.locator('.capture-pending').filter({ hasText: 'synthetic-jpeg.jpeg' });
  await review.getByRole('button', { name: 'Revisar datos', exact: true }).click();
  await a.p.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
  await a.p.getByRole('checkbox').check();
  let lost = false;
  await a.p.route(`${qaOrigin}/rest/v1/rpc/bt_commit`, async (route) => {
    const payload = route.request().postDataJSON();
    if (!lost && payload.changes?.some((c) => c.collection === 'bets' && c.payload)) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await a.p.getByRole('button', { name: 'Confirmar y registrar apuesta', exact: true }).click();
  await expect.poll(async () => (await snapshot()).records.bets.length, { timeout: 60000 }).toBe(2);
  await a.p.reload();
  await expect(a.p.locator('.bet-card')).toHaveCount(2, { timeout: 60000 });
  s = await snapshot();
  assert.equal(s.records.movements.length, 2);
  assert.equal(s.records.settlements.length, 0);
  assert(lost);
  passed('lost commit response recovers persisted state without double debit');
  // Same-version writes: exactly one wins; the stale one rolls back.
  const beforeRace = await snapshot();
  const change = [
    {
      collection: 'streamers',
      id: 'qa-race',
      payload: { id: 'qa-race', name: 'Synthetic QA race', active: true },
    },
  ];
  const race = await Promise.all([
    owner.rpc('bt_commit', { expected_version: beforeRace.version, changes: change }),
    owner.rpc('bt_commit', { expected_version: beforeRace.version, changes: change }),
  ]);
  assert.equal(race.filter((r) => !r.error).length, 1);
  assert(race.some((r) => r.error?.message.includes('BT_CONFLICT')));
  s = await snapshot();
  assert.equal(s.records.movements.length, 2);
  assert.equal(s.records.bets.length, 2);
  passed('optimistic concurrency rejects stale write atomically');
  // Both devices confirm the exact same review simultaneously.
  await b.p.reload();
  await expect(b.p.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible();
  for (const p of [a.p, b.p]) {
    await p
      .locator('.capture-pending')
      .filter({ hasText: 'synthetic-webp.webp' })
      .getByRole('button', { name: 'Revisar datos', exact: true })
      .click();
    await p.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
    await p.getByRole('checkbox').check();
  }
  await Promise.all([
    a.p.getByRole('button', { name: 'Confirmar y registrar apuesta', exact: true }).click(),
    b.p.getByRole('button', { name: 'Confirmar y registrar apuesta', exact: true }).click(),
  ]);
  await expect.poll(async () => (await snapshot()).records.bets.length, { timeout: 60000 }).toBe(3);
  // Wait for both handlers to finish, then reload both to resolve the stale preview.
  await expect
    .poll(async () => (await snapshot()).records.movements.length, { timeout: 60000 })
    .toBe(3);
  await a.p.reload();
  await b.p.reload();
  await expect(a.p.locator('.bet-card')).toHaveCount(3, { timeout: 60000 });
  await expect(b.p.locator('.bet-card')).toHaveCount(3, { timeout: 60000 });
  s = await snapshot();
  assert.equal(s.records.bets.length, 3);
  assert.equal(s.records.movements.length, 3);
  assert.equal(s.records.settlements.length, 0);
  passed('concurrent explicit confirmations produce one bet and one stake per capture');
  const beforeSecurity = await snapshot();
  const foreignWrite = await stranger
    .from('bt_bets')
    .insert({
      user_id: config.accounts[0].id,
      id: 'qa-forbidden',
      payload: beforeSecurity.records.bets[0],
    });
  assert(foreignWrite.error);
  const directWrite = await owner
    .from('bt_bets')
    .update({ payload: beforeSecurity.records.bets[0] })
    .eq('id', beforeSecurity.records.bets[0].id);
  assert(directWrite.error);
  const duplicateStake = { ...beforeSecurity.records.movements[0], id: 'qa-duplicate-stake' };
  const invalidStake = await owner.rpc('bt_commit', {
    expected_version: beforeSecurity.version,
    changes: [{ collection: 'movements', id: duplicateStake.id, payload: duplicateStake }],
  });
  assert(invalidStake.error);
  assert.deepEqual(await snapshot(), beforeSecurity);
  passed('cross-account/direct writes denied and duplicate stake rolled back atomically');
  // The deployed server permits one Simple Builder selection with multiple leaves.
  const selection = beforeSecurity.records.selections.find((row) => row.betId === bet.id);
  const builder = {
    ...selection,
    builderMarkets: [
      { market: 'Goles del partido', pick: 'Mas de 2.5' },
      { market: 'Ambos equipos anotan', pick: 'Si' },
    ],
  };
  assert.ifError(
    (
      await owner.rpc('bt_commit', {
        expected_version: beforeSecurity.version,
        changes: [{ collection: 'selections', id: builder.id, payload: builder }],
      })
    ).error,
  );
  const withBuilder = await snapshot();
  assert.equal(withBuilder.records.movements.length, 3);
  assert.equal(
    withBuilder.records.selections.find((row) => row.id === builder.id).builderMarkets.length,
    2,
  );
  passed('deployed Simple Builder rule preserves two leaves without another stake');
  // All three form factors use the real authenticated app and persistent account.
  for (const width of [375, 768, 1440]) {
    await a.p.setViewportSize({ width, height: 950 });
    await a.p.goto('/apuestas');
    await expect(a.p.locator('.bet-card')).toHaveCount(3, { timeout: 60000 });
    assert.equal(
      await a.p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await a.p.screenshot({ path: `${output}/persistent-${width}.png`, fullPage: true });
    passed(`persistent UI ${width}px`);
  }
  await a.p.setViewportSize({ width: 1440, height: 950 });
  await a.p
    .locator('.bet-card')
    .filter({ hasText: 'Equipo Norte vs. Equipo Sur' })
    .getByRole('button', { name: 'Cashout', exact: true })
    .click();
  assert.equal((await snapshot()).records.settlements.length, 0);
  await a.p.getByLabel('Monto cobrado', { exact: true }).fill('5');
  await a.p.getByRole('button', { name: 'Guardar resultado', exact: true }).click();
  await expect(a.p.getByRole('dialog')).toHaveCount(0, { timeout: 60000 });
  s = await snapshot();
  assert.equal(s.records.settlements.length, 1);
  assert.equal(s.records.settlements[0].returned, 500);
  assert.equal(s.records.settlements[0].kind, 'Cashout');
  assert.equal(s.records.movements.length, 4);
  assert.equal(s.records.movements.filter((row) => row.kind === 'Apuesta colocada').length, 3);
  assert.equal(s.records.movements.filter((row) => row.amount === 500).length, 1);
  await a.p.reload();
  await a.p.getByRole('button', { name: /Terminadas/ }).click();
  await expect(a.p.locator('.bet-card')).toHaveCount(1, { timeout: 60000 });
  await expect(a.p.locator('.bet-card')).toContainText('Cashout');
  passed(
    'only explicit settlement realizes 500 cents, independent of 800-cent offer and 2000-cent potential',
  );
  assert.equal((await snapshot(stranger)).records.bets.length, 0);
  assert.deepEqual(blocked, []);
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        target: 'authorized isolated Supabase QA',
        results,
        blocked,
        errors,
        final: {
          bets: s.records.bets.length,
          selections: s.records.selections.length,
          movements: s.records.movements.length,
          settlements: s.records.settlements.length,
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => app.instance.close(resolve));
  await Promise.all([owner.auth.signOut(), stranger.auth.signOut()]);
}
