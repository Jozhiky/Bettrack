// Uses only disposable accounts from the ignored QA registry and a synthetic PNG.
import { chromium, expect } from '@playwright/test';
import { accounts, login } from './cloud-qa.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://127.0.0.1:5186';
const account = accounts[0];
assert(account?.username.startsWith('btqa_'), 'Provision disposable QA accounts first');
const api = await login(account);
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(origin + '/apuestas');
  await page.getByLabel('Usuario', { exact: true }).fill(account.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar a BETTRACK' }).click();
  await expect(page.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible({ timeout: 45000 });
  const imageId = randomUUID(), objectPath = `${account.id}/${imageId}`;
  const pixels = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgRkAAAAASUVORK5CYII=', 'base64');
  const uploaded = await api.storage.from('bettrack-captures').upload(objectPath, pixels, { contentType: 'image/png' });
  assert.ifError(uploaded.error);
  const before = await api.rpc('bt_snapshot'); assert.ifError(before.error);
  const inserted = await api.rpc('bt_commit', { expected_version: before.data.version, changes: [
    { collection: 'images', id: imageId, payload: { id: imageId, name: 'qa-captura-erronea.png', hash: createHash('sha256').update(pixels).digest('hex'), path: objectPath } },
    { collection: 'uploads', id: imageId, payload: { id: imageId, imageId, createdAt: new Date().toISOString(), status: 'review', progress: 100, draftJson: '', reason: 'Captura sintética para comprobar el borrado.' } },
  ] });
  assert.ifError(inserted.error);
  await page.reload();
  const card = page.locator('.capture-card').filter({ hasText: 'qa-captura-erronea.png' });
  await expect(card).toBeVisible({ timeout: 45000 });
  const other = await context.newPage();
  await other.goto(origin + '/apuestas');
  const otherCard = other.locator('.capture-card').filter({ hasText: 'qa-captura-erronea.png' });
  await expect(otherCard).toBeVisible({ timeout: 45000 });

  // First write fails: the image must stay visible, and the user can retry.
  let fail = true;
  await page.route('**/rest/v1/rpc/bt_commit', async route => {
    if (fail) { fail = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA simulated temporary failure' }) }); }
    await new Promise(resolve => setTimeout(resolve, 500));
    return route.continue();
  });
  await card.getByRole('button', { name: 'Quitar captura', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('No se pudo quitar', { timeout: 15000 });
  const failed = await api.rpc('bt_snapshot'); assert.ifError(failed.error);
  assert(failed.data.records.uploads.some(row => row.id === imageId));
  assert(failed.data.records.images.some(row => row.id === imageId));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/capture-removal-error.png' });

  await card.getByRole('button', { name: 'Quitar captura', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Quitando…' })).toBeDisabled();
  await expect(card).toHaveCount(0, { timeout: 20000 });
  await expect(otherCard).toHaveCount(0, { timeout: 45000 });
  const after = await api.rpc('bt_snapshot'); assert.ifError(after.error);
  assert(!after.data.records.uploads.some(row => row.id === imageId));
  assert(!after.data.records.images.some(row => row.id === imageId));
  assert(after.data.records.audit.some(row => row.entityId === imageId && row.action === 'Quitar captura pendiente'));
  assert.deepEqual(after.data.records.bets, before.data.records.bets);
  assert.deepEqual(after.data.records.movements, before.data.records.movements);
  await expect.poll(async () => Boolean((await api.storage.from('bettrack-captures').download(objectPath)).error), { timeout: 15000 }).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.capture-card')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/capture-removal-success.png' });
  expect(errors).toEqual([]);
  const report = { origin, verifiedAt: new Date().toISOString(), temporaryErrorRetainsCapture: true, retryEnabled: true, busyButton: true, removedFromDatabase: true, removedFromStorage: true, otherTabSynchronized: true, survivesReload: true, financialRecordsUnchanged: true, audited: true, errors };
  await writeFile('test-results/capture-removal.json', JSON.stringify(report, null, 2));
  console.log(report);
} finally {
  await browser.close();
  await api.auth.signOut();
}
