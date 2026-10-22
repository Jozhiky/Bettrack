import { chromium,expect } from '@playwright/test';
import { accounts,login } from './cloud-qa.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.argv[2], index=Number(process.argv[3]||0), label=process.argv[4]||'batch';
const failOne=process.argv.includes('--fail-one'), account=accounts[index],api=await login(account);
const snap=async()=>{const r=await api.rpc('bt_snapshot');assert.ifError(r.error);return r.data.records;};
assert.equal((await snap()).uploads.length,0,'Use an empty disposable account');
const browser=await chromium.launch();
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/apuestas');
 await page.getByLabel('Usuario',{exact:true}).fill(account.username);
 await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Entrar a BETTRACK'}).click();
 await expect(page.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible({timeout:45000});
 const active=new Set();let peak=0;
 page.on('response',async response=>{
   if(!response.url().includes('/rpc/bt_commit')||!response.ok())return;
   try {const payload=response.request().postDataJSON();for(const c of payload.changes??[])if(c.collection==='uploads'){
     if(c.payload?.status==='processing')active.add(c.id);else active.delete(c.id);
   }peak=Math.max(peak,active.size);}catch{}
 });
 let failed=false;
 if(failOne) await page.route('**/storage/v1/object/bettrack-captures/**',route=>{
   if(route.request().method()==='POST'&&!failed){failed=true;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'QA temporary upload failure'})});}
   return route.continue();
 });
 const start=Date.now();
 await page.getByLabel('Archivos de capturas').setInputFiles([16,18,20,21].map(n=>`D:/richa/bet (${n}).png`));
 let records;
 const waitDone=async count=>expect.poll(async()=>{records=await snap();return records.uploads.length===count&&records.uploads.every(u=>!['queued','processing'].includes(u.status));},{timeout:180000,intervals:[500,1000]}).toBe(true);
 await waitDone(failOne?3:4);
 if(failOne){
   assert(failed);await expect(page.getByRole('region',{name:'Capturas sin subir'})).toContainText('1 capturas');
   await page.getByRole('button',{name:'Reintentar subidas fallidas'}).click();await waitDone(4);
   await expect(page.getByRole('region',{name:'Capturas sin subir'})).toHaveCount(0);
 }
 const elapsedMs=Date.now()-start;
 assert.equal(records.images.length,4);assert.equal(records.settlements.length,0);
 assert.equal(records.movements.length,records.bets.length);
 assert.equal(new Set(records.bets.map(b=>b.fingerprint)).size,records.bets.length);
 const parsed=records.uploads.map(u=>({hash:records.images.find(i=>i.id===u.imageId).originalHash,status:u.status,parsed:JSON.parse(u.draftJson)})).sort((a,b)=>a.hash.localeCompare(b.hash));
 if(label!=='baseline')assert(peak>=2,'Expected two concurrent OCR claims on test desktop');
 assert.deepEqual(errors,[]);
 const report={origin,label,elapsedMs,peak,files:4,bets:records.bets.length,review:records.uploads.filter(u=>u.status==='review').length,failedUploadRecovered:failOne,errors,parsed};
 await writeFile(`test-results/${label}.json`,JSON.stringify(report,null,2));
 console.log({...report,parsed:undefined});
}finally{await browser.close();await api.auth.signOut();}
