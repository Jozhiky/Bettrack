import { chromium, expect as browserExpect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { configuration, api, qaOrigin } from './target.mjs';
import { server } from './server.mjs';
const config = await configuration(),
  owner = api(config),
  other = api(config);
const expect = browserExpect.configure({ timeout: 60000 });
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
// Same allowlisted disposable QA account as the existing suites. Never a member account.
const initial = await snapshot();
const clear = Object.entries(initial.records).flatMap(([collection, rows]) =>
  collection === 'audit' ? [] : rows.map((r) => ({ collection, id: r.id, payload: null })),
);
if (clear.length)
  assert.ifError(
    (await owner.rpc('bt_commit', { expected_version: initial.version, changes: clear })).error,
  );
const app = await server();
const browser = await chromium.launch();
const passed = [],
  errors = [],
  blocked = [],
  financial = [];
const out = 'test-results/automatic-qa';
await mkdir(out, { recursive: true });
try {
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
    p.setDefaultTimeout(60000);
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('request', (r) => {
      if (r.url() === qaOrigin + '/rest/v1/rpc/bt_commit') {
        const body = r.postDataJSON();
        if (body.changes?.some((c) => c.collection === 'bets' && c.payload)) financial.push(body);
      }
    });
    await p.goto('/apuestas');
    await p.getByLabel('Usuario', { exact: true }).fill(config.accounts[0].username);
    await p.getByLabel('Contraseña', { exact: true }).fill(config.accounts[0].password);
    await p.getByRole('button', { name: 'Entrar a BETTRACK', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible();
    return { c, p };
  };
  const a = await session();
  const seed = [],
    ids = [];
  for (let i = 0; i < 20; i++) {
    const kind = i < 10 ? 'Perdida' : i < 15 ? 'Cashout' : i < 19 ? 'Ganada' : 'Pendiente';
    const returned =
      kind === 'Perdida'
        ? 0
        : kind === 'Cashout'
          ? [14000, 7000, 10000, 7000, 14000][i - 10]
          : 14000;
    const event = `Equipo QA${i === 9 ? 0 : i} vs. Equipo QB${i === 9 ? 0 : i}`;
    const text = [
      'Betano',
      `Simple S/100.00${kind === 'Pendiente' ? ' 2.00' : kind === 'Cashout' ? ' Cash Out' : ' ' + kind}`,
      event + ' Hoy 18:00',
      'Goles totales Más/Menos',
      'Más 2.5',
      '2.00',
      'Apuesta S/100.00',
      kind === 'Perdida'
        ? ''
        : i === 18
          ? 'Ganancias s/31 ¿00'
          : kind === 'Pendiente'
            ? 'Ganancias potenciales S/200.00\nCASH OUT S/80.00'
            : `Ganancias S/${(returned / 100).toFixed(2)}`,
    ]
      .filter(Boolean)
      .join('\n');
    const pixels = Buffer.from(
      await a.p.evaluate(
        ({ text, live }) => {
          const c = document.createElement('canvas');
          c.width = 800;
          c.height = 800;
          const x = c.getContext('2d');
          x.fillStyle = 'white';
          x.fillRect(0, 0, 800, 800);
          x.fillStyle = 'black';
          x.font = '28px Arial';
          text.split('\n').forEach((l, n) => x.fillText(l, 20, 40 + n * 55));
          if (live) {
            x.fillStyle = '#202436';
            x.fillRect(680, 150, 100, 100);
            x.fillStyle = '#ff5532';
            x.beginPath();
            [
              [0.55, 0],
              [0, 0.6],
              [0.4, 0.6],
              [0.45, 1],
              [1, 0.35],
              [0.6, 0.35],
            ].forEach(([px, py], i) =>
              i ? x.lineTo(720 + px * 20, 180 + py * 30) : x.moveTo(720 + px * 20, 180 + py * 30),
            );
            x.closePath();
            x.fill();
          }
          return c.toDataURL('image/png').split(',')[1];
        },
        { text, live: i === 10 },
      ),
      'base64',
    );
    const imageId = randomUUID(),
      uploadId = randomUUID(),
      path = config.accounts[0].id + '/' + randomUUID();
    ids.push(uploadId);
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
      text,
      selections: [
        {
          event,
          market: 'Goles totales Más/Menos',
          pick: 'Más 2.5',
          odds: 2,
          sport: '',
          league: '',
        },
      ],
      warnings: [],
      confidence: {},
      ...(kind === 'Cashout' ? { placementHold: { text } } : {}),
      ...(kind === 'Pendiente' ? { odds: 2, potential: 20000, cashoutOffer: 8000 } : {}),
    };
    seed.push(
      {
        collection: 'images',
        id: imageId,
        payload: {
          id: imageId,
          path,
          name: `synthetic-${i}.png`,
          hash: createHash('sha256').update(pixels).digest('hex'),
          bytes: pixels.length,
        },
      },
      {
        collection: 'uploads',
        id: uploadId,
        payload: {
          id: uploadId,
          imageId,
          createdAt: new Date().toISOString(),
          status: i === 16 ? 'error' : 'review',
          progress: 100,
          reason: 'Revisa fechas',
          draftJson: JSON.stringify(draft),
        },
      },
    );
  }
  let s = await snapshot();
  assert.ifError(
    (await owner.rpc('bt_commit', { expected_version: s.version, changes: seed })).error,
  );
  await a.p.reload();
  const region = (p) =>
    p.getByRole('region', { name: 'Importación automática de liquidadas', exact: true });
  const submit = (p) =>
    region(p).getByRole('button', { name: 'Confirmar y registrar 18 liquidadas', exact: true });
  await expect(submit(a.p)).toBeEnabled();
  await expect(region(a.p).getByText('⚡ En vivo', { exact: true })).toBeVisible();
  await expect(region(a.p)).toContainText('17 nuevas · 1 posibles duplicadas sin cargo.');
  await expect(region(a.p)).toContainText('Neto -S/ 760.00');
  assert.equal((await snapshot()).records.movements.length, 0);
  assert.equal(financial.length, 0);
  for (const width of [375, 768, 1440]) {
    await a.p.setViewportSize({ width, height: 950 });
    await expect(region(a.p).locator('tbody tr')).toHaveCount(20);
    assert.equal(
      await a.p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.equal(await a.p.locator('input[type="datetime-local"]').count(), 0);
    await submit(a.p).scrollIntoViewIfNeeded();
    await expect(submit(a.p)).toBeInViewport();
    await a.p.screenshot({ path: `${out}/summary-${width}.png`, fullPage: true });
  }
  passed.push(
    '20 existing drafts recovered; 18 prepared without date inputs; responsive 375/768/1440; no financial request before consent',
  );
  await a.p.route(qaOrigin + '/rest/v1/rpc/bt_capabilities', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ historicalUnknownQuote: true }),
    }),
  );
  await submit(a.p).click();
  await expect(
    a.p.getByRole('alert').filter({ hasText: 'actualización autorizada' }),
  ).toBeVisible();
  assert.equal((await snapshot()).records.movements.length, 0);
  assert.equal(financial.length, 0);
  await a.p.unroute(qaOrigin + '/rest/v1/rpc/bt_capabilities');
  passed.push('older backend blocks entire batch before any financial RPC');
  const b = await session();
  await expect(submit(b.p)).toBeEnabled();
  let lost = false;
  await a.p.route(qaOrigin + '/rest/v1/rpc/bt_commit', async (route) => {
    if (
      !lost &&
      route
        .request()
        .postDataJSON()
        .changes.some((c) => c.collection === 'bets' && c.payload)
    ) {
      lost = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await Promise.all([submit(a.p).click(), submit(b.p).click()]);
  await expect
    .poll(async () => (await snapshot()).records.bets.length, { timeout: 60000 })
    .toBe(17);
  s = await snapshot();
  assert(lost);
  assert.equal(s.records.settlements.length, 17);
  assert.equal(s.records.bets.find((b) => b.id === ids[10]).live, true);
  assert.equal(s.records.bets.find((b) => b.id === ids[10]).historicalTiming.mode, 'live');
  assert.equal(s.records.movements.length, 34);
  assert.equal(s.records.uploads.filter((u) => u.status === 'duplicate').length, 1);
  assert.equal(s.records.uploads.filter((u) => u.status === 'review').length, 2);
  assert(
    s.records.bets.every(
      (b) =>
        b.dateSource === 'accounting' &&
        b.historicalTiming.betAt === null &&
        b.historicalTiming.settledAt === null &&
        b.date === b.historicalTiming.recordedAt,
    ),
  );
  assert.equal(s.records.settlements.filter((x) => x.kind === 'Cashout').length, 5);
  assert.equal(
    s.records.settlements.reduce((n, x) => n + x.returned - x.closedStake, 0),
    -76000,
  );
  assert.equal(s.records.images.length, 20);
  assert.equal((await snapshot(other)).records.bets.length, 0);
  passed.push(
    'simultaneous sessions and lost response: 17 bets/17 final settlements/34 movements; one duplicate, unreadable payout and offer excluded; net -760',
  );
  for (const ctx of [a, b]) {
    await ctx.p.reload();
    await expect(region(ctx.p).locator('tbody tr')).toHaveCount(2);
    await ctx.p.getByRole('button', { name: /Terminadas/ }).click();
    await expect(ctx.p.locator('.bet-card')).toHaveCount(12);
    await ctx.p.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(ctx.p.locator('.bet-card')).toHaveCount(5);
  }
  await a.p.goto('/');
  await expect(a.p.locator('.kpi').filter({ hasText: 'Resultado neto' })).toContainText('760.00');
  passed.push(
    'reload, same-account synchronization and dashboard totals verified; original images and OCR remain available',
  );
  for (const packet of financial) {
    const bets = packet.changes.filter((c) => c.collection === 'bets' && c.payload);
    assert.equal(bets.length, 17);
    assert.equal(
      packet.changes.filter((c) => c.collection === 'settlements' && c.payload).length,
      17,
    );
    assert.equal(
      packet.changes.filter((c) => c.collection === 'movements' && c.payload).length,
      34,
    );
  }
  const bet = s.records.bets[0],
    closure = s.records.settlements.find((x) => x.betId === bet.id),
    payout = s.records.movements.find((x) => x.settlementId === closure.id);
  for (const changes of [
    [
      { collection: 'settlements', id: closure.id, payload: null },
      { collection: 'movements', id: payout.id, payload: null },
    ],
    [
      {
        collection: 'bets',
        id: bet.id,
        payload: {
          ...bet,
          historicalTiming: { ...bet.historicalTiming, betAt: '2099-01-01T00:00:00.000Z' },
        },
      },
    ],
  ]) {
    const rejected = await owner.rpc('bt_commit', { expected_version: s.version, changes });
    assert(rejected.error?.message.includes('BT_HISTORICAL_REQUIRES_FINAL_SETTLEMENT'));
    assert.equal((await snapshot()).version, s.version);
  }
  passed.push(
    'database rolls back reopening and falsified historical chronology without changing account version',
  );
  // Synthetic equivalent of a retained settled receipt. Original cached OCR is
  // corrupt; both real, local Tesseract crops must recover the printed payout.
  const retainedDraft = {
    house: 'Betano',
    kind: 'Simple',
    stake: 2000,
    text: 'Betano\nSimple S/20.00 Ganada\nApuesta S/20.00\nGanancias s/31 ¿00',
    selections: [
      {
        event: 'Equipo QR vs. Equipo QS',
        market: 'Goles totales Más/Menos',
        pick: 'Más 2.5',
        odds: 1.55,
        sport: '',
        league: '',
      },
    ],
    warnings: [],
    confidence: {},
  };
  const retainedBytes = Buffer.from(
    await a.p.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 800;
      const x = c.getContext('2d');
      x.fillStyle = '#202436';
      x.fillRect(0, 0, 800, 800);
      x.fillStyle = 'white';
      x.font = 'bold 30px Arial';
      x.fillText('Betano', 30, 50);
      x.fillText('Simple S/20.00 Ganada', 30, 110);
      x.fillText('Apuesta', 35, 635);
      x.fillText('S/20.00', 620, 635);
      x.fillText('Ganancias', 35, 725);
      x.fillText('S/31.00', 620, 725);
      return c.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  const retainedId = randomUUID(),
    retainedImage = randomUUID(),
    retainedPath = config.accounts[0].id + '/' + randomUUID();
  assert.ifError(
    (
      await owner.storage
        .from('bettrack-captures')
        .upload(retainedPath, retainedBytes, { contentType: 'image/png', upsert: false })
    ).error,
  );
  s = await snapshot();
  assert.ifError(
    (
      await owner.rpc('bt_commit', {
        expected_version: s.version,
        changes: [
          {
            collection: 'images',
            id: retainedImage,
            payload: {
              id: retainedImage,
              path: retainedPath,
              name: 'synthetic-retained-receipt.png',
              hash: createHash('sha256').update(retainedBytes).digest('hex'),
              bytes: retainedBytes.length,
            },
          },
          {
            collection: 'uploads',
            id: retainedId,
            payload: {
              id: retainedId,
              imageId: retainedImage,
              createdAt: new Date().toISOString(),
              status: 'review',
              progress: 100,
              reason: 'legacy',
              draftJson: JSON.stringify(retainedDraft),
            },
          },
        ],
      })
    ).error,
  );
  await a.p.goto('/apuestas');
  const recoveredSubmit = region(a.p).getByRole('button', {
    name: 'Confirmar y registrar 1 liquidadas',
    exact: true,
  });
  await expect(recoveredSubmit).toBeEnabled();
  s = await snapshot();
  const recovered = JSON.parse(s.records.uploads.find((u) => u.id === retainedId).draftJson);
  assert.equal(recovered.text, retainedDraft.text);
  assert(recovered.receiptOcr.text.includes('31.00'));
  assert.equal(
    recovered.receiptOcr.imageHash,
    createHash('sha256').update(retainedBytes).digest('hex'),
  );
  assert.equal(s.records.bets.length, 17);
  assert.equal(s.records.movements.length, 34);
  assert(
    s.records.audit.some(
      (a) => a.entityId === retainedId && a.action === 'Recuperar lectura de cobro de captura',
    ),
  );
  for (const ctx of [a, b]) {
    await ctx.p.goto('/apuestas');
    await ctx.p.reload();
    await expect(
      region(ctx.p).getByRole('button', {
        name: 'Confirmar y registrar 1 liquidadas',
        exact: true,
      }),
    ).toBeEnabled();
  }
  await recoveredSubmit.click();
  await expect.poll(async () => (await snapshot()).records.bets.length).toBe(18);
  s = await snapshot();
  assert.equal(s.records.settlements.length, 18);
  assert.equal(s.records.movements.length, 36);
  assert.equal(s.records.settlements.find((x) => x.betId === retainedId).returned, 3100);
  assert.equal(
    s.records.settlements.reduce((n, x) => n + x.returned - x.closedStake, 0),
    -74900,
  );
  passed.push(
    'real local OCR recovers a synthetic retained payout; original OCR and image preserved; metadata persists across reload and two sessions; no finances until consent; one stake and one return, net +11',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  await writeFile(
    out + '/report.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        synthetic: true,
        passed,
        final: {
          bets: 18,
          settlements: 18,
          movements: 36,
          duplicates: 1,
          exceptions: 2,
          netCents: -74900,
        },
        errors,
        blocked,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ passed }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => app.instance.close(resolve));
  await owner.auth.signOut();
  await other.auth.signOut();
}
