// Real OCR and cloud commits, disposable accounts only; no member data changes.
import {chromium,expect} from '@playwright/test';
import {accounts,login} from './cloud-qa.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin=process.argv[2], account=accounts[Number(process.argv[3]||0)],label=process.argv[4]||'markets';
const expected=[
  {n:15,stake:1500,odds:2.91,potential:4376,count:4,children:[2,2,2,0]},
  {n:17,stake:1571,odds:4.5,potential:7070,count:1,children:[4]},
  {n:19,stake:150,odds:21745.76,potential:3261864,count:18,children:[0,0,2,3,4,3,3,0,0,0,0,0,0,0,0,0,0,2]},
  {n:21,stake:250,odds:66.17,potential:16544,count:5,children:[4,4,4,4,4]},
  {n:23,stake:519,odds:58.91,potential:30577,count:8,children:[0,0,0,0,0,2,0,2]},
  {n:24,stake:200,odds:171.5,potential:34300,count:21,children:Array(21).fill(0)},
];
const api=await login(account);
const snapshot=async()=>{const r=await api.rpc('bt_snapshot');assert.ifError(r.error);return r.data.records;};
assert.equal((await snapshot()).uploads.length,0,'Requires empty QA account');
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/apuestas');
 await page.getByLabel('Usuario',{exact:true}).fill(account.username);
 await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Entrar a BETTRACK'}).click();
 await expect(page.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible({timeout:45000});
 await page.getByLabel('Archivos de capturas').setInputFiles(expected.map(e=>`D:/richa/bet (${e.n}).png`));
 let records;
 await expect.poll(async()=>{records=await snapshot();return records.uploads.length===6&&records.uploads.every(u=>!['queued','processing'].includes(u.status));},{timeout:180000,intervals:[1000]}).toBe(true);
 const summary=[];
 for(const e of expected){
  const image=records.images.find(i=>i.name===`bet (${e.n}).png`),upload=records.uploads.find(u=>u.imageId===image.id);
  assert.equal(upload.status,'saved',`${image.name}: ${upload.reason}`);
  const bet=records.bets.find(b=>b.id===upload.betId),selections=records.selections.filter(s=>s.betId===bet.id).sort((a,b)=>a.order-b.order);
  assert.equal(bet.stake,e.stake);assert.equal(bet.odds,e.odds);assert.equal(bet.potential,e.potential);
  assert.equal(selections.length,e.count);assert.deepEqual(selections.map(s=>s.builderMarkets?.length??0),e.children);
  if(e.n===17){assert.equal(bet.kind,'Simple');assert.equal(selections[0].builderMarkets[1].pick,'Ousmane Dembélé (Paris Saint-Germain)');assert.equal(selections[0].builderMarkets[1].market,'Jugador que anota o da una asistencia');assert.equal(selections[0].builderMarkets[1].promotion,'Suplente de Oro');}
  if(e.n===21)assert.equal(selections[1].builderMarkets[3].market,'Total de Saques de banda');
  if(e.n===24)assert.equal(selections[1].event,'Real Madrid vs. Sevilla FC');
  summary.push({file:image.name,selections:selections.length,markets:e.children.reduce((a,b)=>a+b,0),stake:bet.stake,potential:bet.potential});
 }
 assert.equal(records.bets.length,6);assert.equal(records.settlements.length,0);assert.equal(records.movements.length,6);
 assert.equal(records.movements.reduce((sum,m)=>sum+m.amount,0),-expected.reduce((sum,e)=>sum+e.stake,0));
 // Server must still reject a Simple ticket with two outer legs atomically.
 const before=await api.rpc('bt_snapshot');assert.ifError(before.error);
 const simple=records.bets.find(b=>b.kind==='Simple');
 const leg=records.selections.find(s=>s.betId===simple.id);
 const rejected=await api.rpc('bt_commit',{expected_version:before.data.version,changes:[{collection:'selections',id:'qa-invalid-second-leg',payload:{...leg,id:'qa-invalid-second-leg',order:1}}]});
 assert(rejected.error,'Server accepted two outer legs in a Simple ticket');
 const after=await api.rpc('bt_snapshot');assert.ifError(after.error);assert.deepEqual(after.data,before.data);
 await page.reload();await expect(page.locator('.bet-card')).toHaveCount(6,{timeout:45000});
 assert.equal((await snapshot()).bets.length,6);assert.deepEqual(errors,[]);
 const report={origin,verifiedAt:new Date().toISOString(),summary,noAutomaticSettlements:true,persistsReload:true,errors};
 await writeFile(`test-results/${label}.json`,JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();await api.auth.signOut();}
