import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
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
  const r = await client.rpc('bt_snapshot');
  assert.ifError(r.error);
  return r.data;
};
// Dedicated synthetic fixture account only. Existing member data is never reachable.
const start = await snapshot();
const changes = Object.entries(start.records).flatMap(([collection, rows]) =>
  collection === 'audit' ? [] : rows.map((row) => ({ collection, id: row.id, payload: null })),
);
if (changes.length)
  assert.ifError(
    (await owner.rpc('bt_commit', { expected_version: start.version, changes })).error,
  );
const pending = await owner.from('bt_storage_cleanup').select('path');
assert.ifError(pending.error);
if (pending.data.length) {
  const paths = pending.data.map((p) => p.path);
  assert.ifError((await owner.storage.from('bettrack-captures').remove(paths)).error);
  assert.ifError((await owner.from('bt_storage_cleanup').delete().in('path', paths)).error);
}
// After reset, clean only orphan objects inside this disposable fixture prefix.
const orphaned = await owner.storage
  .from('bettrack-captures')
  .list(config.accounts[0].id, { limit: 1000 });
assert.ifError(orphaned.error);
assert(orphaned.data.length < 1000);
if (orphaned.data.length)
  assert.ifError(
    (
      await owner.storage
        .from('bettrack-captures')
        .remove(orphaned.data.map((o) => config.accounts[0].id + '/' + o.name))
    ).error,
  );
await mkdir('test-results/settled-qa', { recursive: true });
const out = 'test-results/settled-qa';
const app = await server();
let browser;
const errors = [],
  blocked = [],
  packets = [],
  passed = [];
try {
  browser = await chromium.launch();
  const session = async () => {
    const c = await browser.newContext({
      baseURL: app.origin,
      serviceWorkers: 'block',
      viewport: { width: 1440, height: 950 },
    });
    await c.route('**/*', (route) => {
      if ([app.origin, qaOrigin].includes(new URL(route.request().url()).origin))
        return route.continue();
      blocked.push(new URL(route.request().url()).origin);
      return route.abort();
    });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.setDefaultTimeout(60000);
    p.on('request', (req) => {
      if (req.url() === qaOrigin + '/rest/v1/rpc/bt_commit') {
        const data = req.postDataJSON();
        if (data.changes?.some((c) => c.collection === 'bets' && c.payload))
          packets.push(
            data.changes.map((c) => ({
              collection: c.collection,
              kind: c.payload?.kind,
              amount: c.payload?.amount,
            })),
          );
      }
    });
    await p.goto('/apuestas');
    await p.getByLabel('Usuario', { exact: true }).fill(config.accounts[0].username);
    await p.getByLabel('Contraseña', { exact: true }).fill(config.accounts[0].password);
    await p.getByRole('button', { name: 'Entrar a BETTRACK', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible({
      timeout: 60000,
    });
    return { c, p };
  };
  const a = await session();
  const fixtures = [];
  const now = new Date().toISOString();
  const seeded = [];
  for (let i = 0; i < 21; i++) {
    const kind = [0, 7, 10, 11].includes(i) ? 'Ganada' : i === 1 || i >= 9 ? 'Perdida' : 'Cashout';
    const returned =
      i === 0 || i === 2 || i === 7
        ? 14000
        : i === 3 || i === 5 || i === 6
          ? 7000
          : i === 4
            ? 10000
            : 0;
    const event = i === 8 ? 'Equipo QA0 vs. Equipo QB0' : `Equipo QA${i} vs. Equipo QB${i}`;
    const text = [
      'Betano',
      `Simple S/100.00${i === 20 ? '' : kind === 'Cashout' ? ' Cash Out' : ' ' + kind}`,
      event,
      'Goles totales',
      'Más de 2.5',
      '2.00',
      ...(i === 20 ? ['Cuota total 2.00', 'Retorno potencial S/200.00'] : []),
      i === 20
        ? 'CASH OUT S/80.00'
        : kind === 'Cashout'
          ? i === 5
            ? ''
            : `Ganancias S/${(returned / 100).toFixed(2)}`
          : kind === 'Ganada'
            ? 'Ganancias S/140.00'
            : '',
      ...(i === 6 ? ['Cashout parcial', 'Stake cerrado S/50.00'] : []),
    ]
      .filter(Boolean)
      .join('\n');
    const pixels = Buffer.from(
      await a.p.evaluate((text) => {
        const c = document.createElement('canvas');
        c.width = 1000;
        c.height = 850;
        const x = c.getContext('2d');
        x.fillStyle = 'white';
        x.fillRect(0, 0, 1000, 850);
        x.fillStyle = 'black';
        x.font = '30px Arial';
        text.split('\n').forEach((l, n) => x.fillText(l, 30, 45 + n * 58));
        return c.toDataURL('image/png').split(',')[1];
      }, text),
      'base64',
    );
    const imageId = randomUUID(),
      uploadId = randomUUID(),
      path = config.accounts[0].id + '/' + randomUUID();
    assert.ifError(
      (
        await owner.storage
          .from('bettrack-captures')
          .upload(path, pixels, { contentType: 'image/png', upsert: false })
      ).error,
    );
    const draft = {
      house: 'Betano',
      kind: 'Simple',
      stake: 10000,
      ...(i === 20 ? { odds: 2, potential: 20000 } : {}),
      text,
      selections: [
        {
          event,
          market: 'Goles totales',
          pick: 'Más de 2.5',
          odds: 2,
          sport: 'Fútbol',
          league: '',
        },
      ],
      warnings: [],
      confidence: {},
    };
    seeded.push(
      {
        collection: 'images',
        id: imageId,
        payload: {
          id: imageId,
          name: `legacy-${i}.png`,
          hash: createHash('sha256').update(pixels).digest('hex'),
          path,
          bytes: pixels.length,
        },
      },
      {
        collection: 'uploads',
        id: uploadId,
        payload: {
          id: uploadId,
          imageId,
          createdAt: now,
          status: i === 7 ? 'error' : 'review',
          progress: 100,
          reason: 'El boleto ya muestra estado global ' + kind,
          draftJson: JSON.stringify(draft),
        },
      },
    );
    fixtures.push({ i, kind, returned, event, uploadId, imageId });
  }
  const beforeSeed = await snapshot();
  assert.ifError(
    (await owner.rpc('bt_commit', { expected_version: beforeSeed.version, changes: seeded })).error,
  );
  await a.p.reload();
  const inbox = (p) => p.getByRole('region', { name: 'Importación de históricas' });
  const expand = async (p) => {
    const summary = inbox(p).locator('summary');
    await expect(summary).toContainText('Históricas en revisión');
    if (
      !(await inbox(p)
        .locator('details')
        .getAttribute('open')
        .then((v) => v !== null))
    )
      await summary.click();
  };
  await expand(a.p);
  await expect(inbox(a.p).locator('tbody tr')).toHaveCount(20);
  assert.equal((await snapshot()).records.bets.length, 0);
  assert.equal((await snapshot()).records.movements.length, 0);
  const b = await session();
  const open = async (p, i) => {
    await expand(p);
    const f = fixtures[i];
    const row = inbox(p).locator(`tr[data-upload-id="${f.uploadId}"]`);
    await row.getByRole('button').click();
    await expect(p.getByRole('dialog')).toBeVisible();
    await p.getByLabel('Fecha de apuesta', { exact: true }).fill('2026-10-20T10:00');
    await p.getByLabel('Fecha de liquidación', { exact: true }).fill('2026-10-21T12:00');
    await expect(p.getByLabel('Cuota total histórica', { exact: true })).toHaveValue('');
    await expect(p.getByLabel('Retorno potencial original', { exact: true })).toHaveValue('');
    if (f.kind === 'Cashout')
      await p.getByRole('checkbox', { name: /He verificado que el Cash Out/ }).check();
    const suggestion = p.getByRole('button', {
      name: 'Usar importe mostrado como retorno total recibido',
      exact: true,
    });
    if (await suggestion.count()) await suggestion.click();
  };
  const preview = async (p) => {
    await p.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
    await expect(
      p.getByRole('button', { name: 'Confirmar e importar liquidada', exact: true }),
    ).toBeDisabled();
  };
  const submit = async (p) => {
    await p.getByRole('checkbox').check();
    await p.getByRole('button', { name: 'Confirmar e importar liquidada', exact: true }).click();
  };
  const count = async (n) =>
    expect.poll(async () => (await snapshot()).records.bets.length, { timeout: 60000 }).toBe(n);
  await open(a.p, 0);
  await preview(a.p);
  assert.equal((await snapshot()).records.movements.length, 0);
  // Older backends must block a null quote BEFORE the financial RPC, even after consent.
  await a.p.route(qaOrigin + '/rest/v1/rpc/bt_capabilities', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST202', message: 'QA injected older backend' }),
    }),
  );
  await submit(a.p);
  await expect(
    a.p.getByRole('alert').filter({ hasText: 'El backend todavía no admite históricos' }),
  ).toBeVisible();
  assert.equal((await snapshot()).records.movements.length, 0);
  assert.equal((await snapshot()).records.bets.length, 0);
  await a.p.unroute(qaOrigin + '/rest/v1/rpc/bt_capabilities');
  await submit(a.p);
  await count(1);
  let s = await snapshot();
  assert.equal(s.records.settlements.length, 1);
  assert.equal(s.records.movements.length, 2);
  assert.equal(s.records.settlements[0].returned, 14000);
  assert.equal(s.records.bets[0].date, '2026-10-20T15:00:00.000Z');
  assert.equal(s.records.settlements[0].date, '2026-10-21T17:00:00.000Z');
  assert.equal(s.records.bets[0].createdAt, now);
  passed.push(
    '20 realistic legacy drafts: 4 wins, 10 losses, 6 header cashouts; missing quote/potential preserved; older backend safely blocked',
  );
  await open(a.p, 1);
  await preview(a.p);
  await submit(a.p);
  await count(2);
  await open(a.p, 2);
  await preview(a.p);
  await open(b.p, 2);
  await preview(b.p);
  await Promise.all([submit(a.p), submit(b.p)]);
  await count(3);
  s = await snapshot();
  assert.equal(s.records.movements.length, 6);
  assert.equal(s.records.settlements.length, 3);
  passed.push('loss and simultaneous cashout confirmations: one stake and payout per ticket');
  await a.p.reload();
  await b.p.reload();
  await open(a.p, 3);
  await preview(a.p);
  let lost = false;
  await a.p.route(qaOrigin + '/rest/v1/rpc/bt_commit', async (route) => {
    const body = route.request().postDataJSON();
    if (!lost && body.changes?.some((c) => c.collection === 'bets' && c.payload)) {
      lost = true;
      await route.fetch();
      await route.abort();
      return;
    }
    await route.continue();
  });
  await submit(a.p);
  await count(4);
  await a.p.reload();
  s = await snapshot();
  assert.equal(s.records.movements.length, 8);
  assert.equal(
    s.records.settlements.filter((x) => x.kind === 'Cashout' && x.returned === 7000).length,
    1,
  );
  assert(lost);
  passed.push('lost response after atomic cashout loss recovered without double debit');
  await open(a.p, 4);
  await preview(a.p);
  await submit(a.p);
  await count(5);
  await open(a.p, 5);
  await a.p.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
  await expect(a.p.getByRole('alert')).toContainText('Completa');
  await a.p.getByLabel('Importe efectivamente recibido', { exact: true }).fill('70');
  await preview(a.p);
  await submit(a.p);
  await count(6);
  await open(a.p, 7);
  await preview(a.p);
  await submit(a.p);
  await count(7);
  passed.push(
    'cashout break-even, explicit user payout completion and legacy error draft reopened',
  );
  await open(a.p, 6);
  await a.p.getByRole('button', { name: 'Ver resumen antes de registrar', exact: true }).click();
  await expect(a.p.getByRole('alert').filter({ hasText: 'parcial' }).first()).toBeVisible();
  await expect(
    a.p.getByRole('button', { name: 'Confirmar e importar liquidada', exact: true }),
  ).toHaveCount(0);
  await a.p.getByRole('button', { name: 'Cerrar', exact: true }).click();
  assert.equal((await snapshot()).records.bets.length, 7);
  await expand(a.p);
  await inbox(a.p)
    .getByRole('button', { name: `Revisar histórica ${fixtures[8].event}`, exact: true })
    .click();
  await a.p.getByLabel('Fecha de apuesta', { exact: true }).fill('2026-10-20T10:00');
  await a.p.getByLabel('Fecha de liquidación', { exact: true }).fill('2026-10-21T12:00');
  await a.p.getByRole('checkbox', { name: /He verificado que el Cash Out/ }).check();
  await a.p
    .getByRole('button', { name: 'Usar importe mostrado como retorno total recibido', exact: true })
    .click();
  await preview(a.p);
  await submit(a.p);
  await expect
    .poll(
      async () =>
        (await snapshot()).records.uploads.find((u) => u.id === fixtures[8].uploadId)?.status,
      { timeout: 60000 },
    )
    .toBe('duplicate');
  s = await snapshot();
  assert.equal(s.records.bets.length, 7);
  assert.equal(s.records.movements.length, 14);
  assert.equal(s.records.settlements.length, 7);
  assert(
    s.records.bets.every((b) => b.odds === null && b.potential === null && b.historical === true),
  );
  assert.equal(s.records.images.length, 21);
  assert.equal((await snapshot(other)).records.bets.length, 0);
  assert.equal(s.records.uploads.find((u) => u.id === fixtures[6].uploadId).status, 'review');
  assert.equal(s.records.uploads.find((u) => u.id === fixtures[20].uploadId).status, 'review');
  passed.push('partial and offer remain in review; second photograph cannot duplicate finances');
  for (const packet of packets) {
    assert(packet.some((c) => c.collection === 'settlements'));
    assert.equal(
      packet.filter((c) => c.collection === 'movements' && c.kind === 'Apuesta colocada').length,
      1,
    );
    assert.equal(packet.filter((c) => c.collection === 'movements').length, 2);
  }
  passed.push('every financial request carries bet, settlement, stake and actual return together');
  // The deferred database guard must reject reopening a null-quote historical wager.
  const historicalBet = s.records.bets[0];
  const historicalSettlement = s.records.settlements.find((x) => x.betId === historicalBet.id);
  const historicalReturn = s.records.movements.find(
    (x) => x.settlementId === historicalSettlement.id,
  );
  const removal = await owner.rpc('bt_commit', {
    expected_version: s.version,
    changes: [
      { collection: 'settlements', id: historicalSettlement.id, payload: null },
      { collection: 'movements', id: historicalReturn.id, payload: null },
    ],
  });
  assert(removal.error?.message.includes('BT_HISTORICAL_REQUIRES_FINAL_SETTLEMENT'));
  const rejected = await snapshot();
  assert.equal(rejected.version, s.version);
  assert.equal(rejected.records.settlements.length, 7);
  assert.equal(rejected.records.movements.length, 14);
  passed.push('database deferred guard rolls back attempts to reopen unknown-quote history');
  for (const width of [375, 768, 1440]) {
    await a.p.setViewportSize({ width, height: 950 });
    await a.p.goto('/apuestas');
    await expand(a.p);
    assert.equal(
      await a.p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await a.p.screenshot({ path: `${out}/legacy-inbox-${width}.png`, fullPage: true });
    await open(a.p, 9);
    await preview(a.p);
    const confirm = a.p.getByRole('button', {
      name: 'Confirmar e importar liquidada',
      exact: true,
    });
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeInViewport();
    await expect(confirm).toBeDisabled();
    assert.equal(
      await a.p.getByRole('dialog').evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    await a.p.screenshot({ path: `${out}/historical-preview-${width}.png` });
    await a.p.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await a.p.getByRole('button', { name: /Terminadas/ }).click();
    await expect(a.p.locator('.bet-card')).toHaveCount(7, { timeout: 60000 });
  }
  await a.p.goto('/');
  assert.equal(
    s.records.settlements.reduce((n, r) => n + r.returned - r.closedStake, 0),
    -4000,
  );
  await expect(a.p.locator('.kpi').filter({ hasText: 'Resultado neto' })).toContainText('40.00');
  await expect(a.p.locator('.kpi').filter({ hasText: 'Resultado neto' })).toContainText('-');
  await a.p.goto('/estadisticas');
  await expect(a.p.locator('.kpi').filter({ hasText: 'Cuota promedio' })).toContainText(
    'No visible',
  );
  passed.push('responsive legacy inbox, persisted closed history and dashboard net -40.00');
  assert.equal(
    (await snapshot()).records.movements.length,
    14,
    'responsive preview must never write finances',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  await writeFile(
    out + '/report.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        synthetic: true,
        legacyDrafts: 20,
        offerOnly: 1,
        final: { bets: 7, settlements: 7, stakeMovements: 7, returnMovements: 7 },
        passed,
        errors,
        blocked,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => app.instance.close(resolve));
  await owner.auth.signOut();
  await other.auth.signOut();
}
