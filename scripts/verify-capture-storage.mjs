import { chromium, expect } from '@playwright/test';
import { accounts, login } from './cloud-qa.mjs';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const origin = process.argv[2] || 'http://127.0.0.1:5186';
const account = accounts[1], api = await login(account);
const snapshot = async () => { const r=await api.rpc('bt_snapshot'); assert.ifError(r.error); return r.data; };
assert.equal((await snapshot()).records.bets.length,0,'Use an empty disposable account');
// Financial fixtures isolate storage/synchronization from parser coverage.
// OCR itself is verified against real pixels by verify-image-optimization.mjs.
async function registerFixture() {
  let snap;
  await expect.poll(async()=>{snap=await snapshot();return snap.records.uploads.some(u=>['review','error','duplicate'].includes(u.status));},{timeout:90000}).toBe(true);
  const u=snap.records.uploads.find(u=>['review','error','duplicate'].includes(u.status));
  const now=new Date().toISOString(), house=snap.records.houses[0];
  const bet={id:u.id,date:now,dateSource:'upload',timingUnknown:true,houseId:house.id,streamerId:'',kind:'Simple',live:false,stake:318,odds:3.1,potential:986,notes:'QA de almacenamiento: datos sintéticos',source:'ocr',imageId:u.imageId,fingerprint:'a'.repeat(64),createdAt:now,updatedAt:now};
  const selection={id:randomUUID(),betId:u.id,event:'QA Local vs. QA Visitante',sport:'Fútbol',league:'',market:'Resultado del partido',pick:'QA Local',odds:3.1,order:0};
  const move={id:randomUUID(),houseId:house.id,betId:u.id,date:now,kind:'Apuesta colocada',amount:-318,note:'QA de almacenamiento'};
  const result=await api.rpc('bt_commit',{expected_version:snap.version,changes:[
    {collection:'bets',id:bet.id,payload:bet},{collection:'selections',id:selection.id,payload:selection},{collection:'movements',id:move.id,payload:move},
    {collection:'uploads',id:u.id,payload:{...u,status:'saved',betId:u.id,reason:'',progress:100}},
  ]}); assert.ifError(result.error);
}
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(origin+'/apuestas');
  await page.getByLabel('Usuario',{exact:true}).fill(account.username);
  await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'Entrar a BETTRACK'}).click();
  await expect(page.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible({timeout:45000});
  const upload = () => page.getByLabel('Archivos de capturas').setInputFiles('D:/richa/bet (4).png');
  await upload();
  await registerFixture();
  await expect(page.locator('.bet-card')).toHaveCount(1,{timeout:90000});
  const first = await snapshot(), image = first.records.images[0];
  assert.equal(first.records.images.length,1);
  assert(image.bytes < image.originalBytes);
  const stored=await api.storage.from('bettrack-captures').download(image.path);
  assert.ifError(stored.error);
  assert.equal(stored.data.size,image.bytes);
  await upload();
  await expect(page.getByRole('button',{name:'Registrar como otra apuesta'})).toBeVisible({timeout:30000});
  await registerFixture();
  await expect(page.locator('.bet-card')).toHaveCount(2,{timeout:90000});
  const shared = await snapshot();
  assert.equal(shared.records.images.length,1);
  assert(shared.records.bets.every(b=>b.imageId===image.id));
  const other = await context.newPage();
  await other.goto(origin+'/apuestas');
  await expect(other.locator('.bet-card')).toHaveCount(2,{timeout:45000});
  let downloadCount=0;
  page.on('request',r=>{if(r.url().includes('/storage/v1/object/'))downloadCount++;});
  await page.reload();
  await expect(page.locator('.bet-card')).toHaveCount(2,{timeout:45000});
  assert.equal(downloadCount,0,'Cards do not download original images');
  await page.locator('.bet-card').first().getByRole('button',{name:'Ver detalle'}).click();
  const detail=page.getByRole('dialog',{name:'Detalle de apuesta'});
  await expect(detail).toBeVisible();
  assert.equal(downloadCount,0,'Summary does not download original');
  await detail.getByRole('button',{name:'Ver captura',exact:true}).click();
  await expect(detail.getByAltText('Captura guardada del boleto')).toBeVisible();
  assert.equal(downloadCount,1);
  await detail.getByRole('button',{name:'Ocultar captura',exact:true}).click();
  await detail.getByRole('button',{name:'Ver captura',exact:true}).click();
  await expect(detail.getByAltText('Captura guardada del boleto')).toBeVisible();
  assert.equal(downloadCount,1,'Memory cache avoids a second download');
  await detail.getByRole('button',{name:'Cerrar',exact:true}).click();
  if(origin.includes('127.0.0.1')) {
    let snapshots=0;
    const listener=r=>{if(r.url().includes('/rpc/bt_snapshot'))snapshots++;};
    page.on('request',listener);
    await page.evaluate(async()=>{const {cloudStore}=await import('/src/data/cloudStore.ts');await cloudStore.refresh();await cloudStore.refresh();});
    page.off('request',listener);
    assert.equal(snapshots,0,'Unchanged refresh reads version only');
  }
  await page.locator('.bet-card').first().getByRole('button',{name:'Perdida',exact:true}).click();
  await expect(page.locator('.bet-card')).toHaveCount(1,{timeout:20000});
  await expect(other.locator('.bet-card')).toHaveCount(1,{timeout:45000});
  await page.goto(origin+'/configuracion');
  await expect(page.getByRole('button',{name:'Liberar capturas de terminadas (0)'})).toBeDisabled({timeout:30000});
  await page.goto(origin+'/apuestas');
  await page.locator('.bet-card').getByRole('button',{name:'Cashout',exact:true}).click();
  await page.getByLabel('Monto cobrado').fill('8.50');
  await page.getByRole('button',{name:'Guardar resultado'}).click();
  await expect(page.locator('.bet-card')).toHaveCount(0,{timeout:20000});
  const settled=await snapshot();
  assert.equal(settled.records.settlements.length,2);
  await page.goto(origin+'/configuracion');
  await page.getByRole('button',{name:'Liberar capturas de terminadas (1)'}).click();
  await page.getByRole('dialog',{name:'Liberar espacio'}).getByRole('button',{name:'Eliminar capturas',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Liberar espacio'})).toHaveCount(0,{timeout:20000});
  const cleaned=await snapshot();
  assert.equal(cleaned.records.images.length,0);
  assert.deepEqual(cleaned.records.movements,settled.records.movements);
  assert.deepEqual(cleaned.records.settlements,settled.records.settlements);
  assert.equal(cleaned.records.bets.length,2);
  await expect.poll(async()=>Boolean((await api.storage.from('bettrack-captures').download(image.path)).error),{timeout:15000}).toBe(true);
  await page.screenshot({path:'test-results/capture-storage.png'});
  assert.deepEqual(errors,[]);
  const report={origin,verifiedAt:new Date().toISOString(),optimizedBytes:image.bytes,originalBytes:image.originalBytes,sharedImageForIndependentBets:true,lazyImageAndRamCache:true,realtimeOtherTab:true,openBetProtection:true,storageDeleted:true,financesPreserved:true,errors};
  await writeFile('test-results/capture-storage.json',JSON.stringify(report,null,2)); console.log(report);
} finally {await browser.close();await api.auth.signOut();}
