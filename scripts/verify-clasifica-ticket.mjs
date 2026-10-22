// Actual uploaded screenshot, real OCR and cloud persistence; disposable QA account only.
import { chromium, expect } from '@playwright/test';
import { accounts, login } from './cloud-qa.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.argv[2] || 'https://bettrack-wostcloud1.web.app';
const account=accounts[0],api=await login(account);
const snap=async()=>{const r=await api.rpc('bt_snapshot');assert.ifError(r.error);return r.data.records;};
assert.equal((await snap()).bets.length,0,'Use a fresh QA account');
const browser=await chromium.launch();
try {
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/apuestas');
 await page.getByLabel('Usuario',{exact:true}).fill(account.username);
 await page.getByLabel('Contraseña',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Entrar a BETTRACK'}).click();
 await expect(page.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible({timeout:45000});
 await page.getByLabel('Archivos de capturas').setInputFiles('D:/richa/bet (16).png');
 await expect(page.locator('.bet-card')).toHaveCount(1,{timeout:90000});
 const records=await snap(),bet=records.bets[0],u=records.uploads[0],sels=records.selections.sort((a,b)=>a.order-b.order);
 assert.equal(bet.kind,'Combinada');assert.equal(bet.stake,3500);assert.equal(bet.odds,2.43);assert.equal(bet.potential,8533);
 assert.equal(sels.length,4);
 assert.deepEqual(sels.map(s=>s.event),['Manchester City vs. AEK Atenas','Paris Saint-Germain vs. FC Barcelona','FC Porto vs. PSV Eindhoven','Vasco da Gama RJ vs. Boca Juniors']);
 assert.equal(sels[3].market,'Clasifica');assert.equal(sels[3].pick,'Vasco da Gama RJ');
 assert.deepEqual(sels.map(s=>s.builderMarkets?.length??0),[0,2,2,0]);
 assert.equal(sels[2].builderMarkets[1].market,'FC Porto - Goles totales Más/Menos');
 assert.equal(records.settlements.length,0);assert.equal(records.movements.length,1);assert.equal(records.movements[0].amount,-3500);
 assert.equal(u.status,'saved');assert.equal(JSON.parse(u.draftJson).cashoutOffer,2868);
 await page.reload();
 await expect(page.locator('.bet-card')).toHaveCount(1,{timeout:45000});
 await page.getByRole('button',{name:'Ver detalle'}).click();
 await page.locator('.ticket-selections > summary').last().click();
 await expect(page.getByRole('dialog').getByText('Vasco da Gama RJ · Clasifica',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/clasifica-ticket.png'});
 assert.deepEqual(errors,[]);
 const report={origin,verifiedAt:new Date().toISOString(),actualImage:'bet (16).png',automaticRegistration:true,selections:4,builderMarkets:4,stake:3500,odds:2.43,potential:8533,cashoutOffer:2868,noExecutedCashout:true,survivesReload:true,errors};
 await writeFile('test-results/clasifica-ticket.json',JSON.stringify(report,null,2));console.log(report);
} finally {await browser.close();await api.auth.signOut();}
