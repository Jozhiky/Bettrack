import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { uploadSynthetic } from './helpers';

const accounts = JSON.parse(await readFile('.env.qa.json', 'utf8')) as { email: string; username: string; password: string; id: string }[];
const api = () => createClient('https://wfrpqzyokzrstafuqujf.supabase.co','sb_publishable_Cw2igNt5de-7OotH61NYGw_UcWbXQ3w',{auth:{persistSession:false,autoRefreshToken:false}});
async function signIn(page: import('@playwright/test').Page, index=0, path='/apuestas') {
  await page.goto(path);
  await page.getByLabel('Usuario',{exact:true}).fill(accounts[index].username);
  await page.getByLabel('Contraseña',{exact:true}).fill(accounts[index].password);
  await page.getByRole('button',{name:'Entrar a BETTRACK'}).click();
  await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible({timeout:45000});
}
test('cloud: sesión, OCR, aislamiento, segundo dispositivo, cashout y eliminación privada', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const login = async (target: typeof page, index: number) => {
    await target.goto('/apuestas');
    await target.getByLabel('Usuario', { exact: true }).fill(accounts[index].username);
    await target.getByLabel('Contraseña', { exact: true }).fill(accounts[index].password);
    await target.getByRole('button', { name: 'Entrar a BETTRACK' }).click();
    await expect(target.getByRole('heading', { name: 'Mis apuestas', exact: true })).toBeVisible({ timeout: 45000 });
  };
  await login(page, 0);
  await uploadSynthetic(page, 'Validacion cloud vs Persistencia');
  await expect(page.locator('.bet-card')).toHaveCount(1, { timeout: 120000 });
  await expect(page.locator('.bet-card')).toContainText('10.00');
  await page.reload();
  await expect(page.locator('.bet-card')).toHaveCount(1, { timeout: 45000 });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'bettrack-local-v1'))).toBe(false);

  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const other = await otherContext.newPage();
  await login(other, 1);
  await expect(other.locator('.bet-card')).toHaveCount(0);
  await other.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Entrar a BETTRACK' })).toBeVisible();
  await login(other, 0);
  await expect(other.locator('.bet-card')).toHaveCount(1, { timeout: 45000 });
  await other.getByRole('button', { name: 'Ver detalle', exact: true }).click();
  await expect(other.getByRole('dialog').locator('img').first()).toBeVisible();
  await other.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await other.getByRole('button', { name: 'Cashout', exact: true }).click();
  await other.getByLabel('Monto cobrado').fill('5');
  await other.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(other.getByRole('dialog')).toHaveCount(0, { timeout: 30000 });
  await page.getByRole('button', { name: /Terminadas/ }).click();
  await expect(page.locator('.bet-card')).toContainText('Cashout', { timeout: 45000 });
  await page.goto('/');
  await expect(page.locator('.kpi').filter({ hasText: 'Resultado neto' })).toContainText('5.00');
  for (const width of [375,768,1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'test-results/cloud-dashboard.png', fullPage: true });
  await page.goto('/configuracion');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:'Respaldo JSON completo'}).click();
  const backupPath = await (await backupDownload).path();
  const backupData = JSON.parse(await readFile(backupPath!,'utf8'));
  expect(backupData.data.bets).toHaveLength(1);
  expect(backupData.images[0].data).toMatch(/^data:image\/png;base64,/);
  await page.locator('input[type=file]').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:await readFile(backupPath!)});
  await expect(page.getByRole('dialog',{name:'Revisar respaldo JSON'})).toBeVisible();
  await page.getByRole('button',{name:'Confirmar restauración'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0,{timeout:30000});
  const owner = api();
  const session = await owner.auth.signInWithPassword(accounts[0]);
  expect(session.error).toBeNull();
  const snapshot = await owner.rpc('bt_snapshot');
  const imagePath = snapshot.data.records.images[0].path;
  await page.goto('/apuestas');
  await page.getByRole('button',{name:/Terminadas/}).click();
  await page.getByRole('button',{name:'Ver detalle',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Eliminar apuesta',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.bet-card')).toHaveCount(0);
  await expect.poll(async()=>Boolean((await owner.storage.from('bettrack-captures').download(imagePath)).error)).toBe(true);
  const afterDelete = await owner.rpc('bt_snapshot');
  expect(afterDelete.data.records.bets).toHaveLength(0);
  expect(afterDelete.data.records.movements).toHaveLength(0);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar a BETTRACK' })).toBeVisible();
  expect(await page.evaluate(() => document.cookie.includes('bt-auth'))).toBe(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar a BETTRACK' })).toBeVisible();
  expect(errors).toEqual([]);
  await otherContext.close();
});

test('login y registro responsive, validación y borrado de la base anterior', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve,reject) => { const request = indexedDB.open('bettrack-local-v1'); request.onupgradeneeded = () => request.result.createObjectStore('bets'); request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
    localStorage.setItem('bettrack-view', 'legacy');
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar a BETTRACK' })).toBeVisible();
  expect(await page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'bettrack-local-v1'))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('bettrack-view'))).toBeNull();
  for (const width of [375,768,1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await expect(page.getByLabel('Confirmar contraseña', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/signup-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.screenshot({ path: `test-results/login-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByLabel('Usuario', { exact: true }).fill('prueba_validacion');
  await page.getByLabel('Contraseña', { exact: true }).fill('Valid-password-123');
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('Different-password');
  await page.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('no coinciden');
});

test('registro real por usuario, acceso inmediato y credenciales incorrectas', async({page})=>{
  const username = 'btqa_'+randomBytes(6).toString('hex');
  const account = {username,email:`${username}@users.bettrack.invalid`,password:randomBytes(20).toString('hex'),id:''};
  // Register cleanup intent before creating the account; no credentials in reports.
  const registry=JSON.parse(await readFile('.env.qa.json','utf8'));
  registry.push(account); await writeFile('.env.qa.json',JSON.stringify(registry));
  await page.goto('/');
  await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  await page.getByLabel('Usuario',{exact:true}).fill(username);
  await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
  await page.getByLabel('Confirmar contraseña',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'Crear mi cuenta'}).click();
  await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible({timeout:45000});
  const client=api(); const result=await client.auth.signInWithPassword(account);
  expect(result.error).toBeNull(); account.id=result.data.user!.id;
  await writeFile('.env.qa.json',JSON.stringify(registry));
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await page.getByLabel('Usuario',{exact:true}).fill(username);
  await page.getByLabel('Contraseña',{exact:true}).fill('Incorrect-password-123');
  await page.getByRole('button',{name:'Entrar a BETTRACK'}).click();
  await expect(page.getByRole('alert')).toContainText('incorrectos');
  await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'Entrar a BETTRACK'}).click();
  await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();
});

test('banca, maestros, guardado remoto y rechazo sin conexión',async({page,context})=>{
  await signIn(page,0,'/banca');
  await page.getByRole('button',{name:'Nuevo movimiento'}).click();
  await page.getByLabel('Importe',{exact:true}).fill('100');
  await page.getByRole('button',{name:'Guardar movimiento'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/casas');
  await page.getByRole('button',{name:'Nueva casa'}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Casa QA cloud');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Casa QA cloud',exact:true})).toBeVisible();
  await page.goto('/streamers');
  await page.getByRole('button',{name:'Nuevo streamer'}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Pronosticador QA');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Pronosticador QA',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Pronosticador QA',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Nuevo streamer'}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('No debe guardarse');
  await context.setOffline(true);
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('conexión');
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Pronosticador QA',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'No debe guardarse',exact:true})).toHaveCount(0);
  for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:950});
    for(const path of ['/','/apuestas','/banca','/casas','/streamers','/estadisticas','/configuracion']){
      await page.goto(path); await expect(page.locator('main h1')).toBeVisible({timeout:30000});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
  expect(await page.evaluate(()=>localStorage.length)).toBe(0);
});
