import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
const app=await preview({configFile:false,build:{outDir:'test-results/historical-compatible-rollback'},preview:{host:'127.0.0.1',port:5193,strictPort:true}});
const origin='http://127.0.0.1:5193', backend='https://wfrpqzyokzrstafuqujf.supabase.co';
const browser=await chromium.launch();
const errors=[],unexpected=[],passed=[];
let commits=0,capabilities=0;
try {
 const context=await browser.newContext({serviceWorkers:'block'});
 const uid='00000000-0000-0000-0000-000000000101';
 const user={id:uid,aud:'authenticated',role:'authenticated',email:'synthetic@users.bettrack.invalid',user_metadata:{username:'QA'},app_metadata:{provider:'email'}};
 const expiry=Math.floor(Date.now()/1000)+3600;
 const jwt=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,aud:'authenticated',role:'authenticated',exp:expiry})).toString('base64url')+'.synthetic';
 await context.addCookies([{name:'bt-auth.0',value:encodeURIComponent(JSON.stringify({access_token:jwt,refresh_token:'synthetic',token_type:'bearer',expires_at:expiry,user})),url:origin,sameSite:'Lax'}]);
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 const selection={event:'Equipo QA vs. Equipo QB',market:'Goles totales',pick:'Más de 2.5',odds:2,sport:'Fútbol',league:''};
 const draft={house:'Betano',kind:'Simple',stake:1000,odds:2,potential:2000,text:'Betano\nSimple S/10.00 Cash Out\nApuesta S/10.00\nGanancias S/7.00',selections:[{...selection,event:'Equipo QC vs. Equipo QD'}],warnings:[],confidence:{}};
 const bet={id:'closed',houseId:'h',streamerId:'',kind:'Simple',live:false,stake:1000,odds:null,potential:null,historical:true,date:'2026-10-20T15:00:00.000Z',dateSource:'manual',timingUnknown:false,notes:'',source:'ocr',fingerprint:'synthetic',createdAt:'2026-10-24T12:00:00.000Z',updatedAt:'2026-10-24T12:00:00.000Z'};
 Object.assign(bet,{date:'2026-10-24T12:00:00.000Z',dateSource:'accounting',timingUnknown:true,historicalTiming:{recordedAt:'2026-10-24T12:00:00.000Z',uploadedAt:'2026-10-24T12:00:00.000Z',betAt:null,settledAt:null,mode:'unknown',events:[]}});
 const records=Object.fromEntries(['houses','streamers','bets','selections','settlements','movements','audit','images','settings','uploads'].map(n=>[n,[]]));
 records.houses=[{id:'h',name:'Betano',active:true,currency:'PEN'}];
 records.settings=[{id:'settings',theme:'light',currency:'PEN',exposureLimit:50000,lossLimit:20000}];
 records.bets=[bet];records.selections=[{...selection,id:'leg',betId:'closed'}];
 records.settlements=[{id:'settlement',betId:'closed',date:bet.date,kind:'Cashout',closedStake:1000,returned:700,note:'synthetic'}];
 records.movements=[{id:'stake',betId:'closed',houseId:'h',date:bet.date,kind:'Apuesta colocada',amount:-1000,note:''},{id:'return',betId:'closed',settlementId:'settlement',houseId:'h',date:bet.date,kind:'Cashout',amount:700,note:''}];
 records.images=[{id:'image',name:'synthetic.png',hash:'synthetic',path:uid+'/synthetic.png'}];
 records.uploads=[{id:'upload',imageId:'image',createdAt:'2026-10-24T12:00:00.000Z',status:'review',progress:100,draftJson:JSON.stringify(draft),reason:'synthetic'}];
 const image=Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,600,400);x.fillStyle='black';x.font='24px Arial';['SINTETICA · QA','Simple S/10.00 Cash Out','Ganancias S/7.00'].forEach((t,i)=>x.fillText(t,25,50+i*80));return c.toDataURL('image/png').split(',')[1];}),'base64');
 await context.routeWebSocket('wss://wfrpqzyokzrstafuqujf.supabase.co/**',ws=>ws.close());
 await context.route('**/*',route=>{
   const r=route.request(),u=new URL(r.url());
   if(u.origin===origin)return route.continue();
   if(u.origin===backend){
    const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(u.pathname==='/rest/v1/rpc/bt_snapshot')return reply({version:1,records});
    if(u.pathname==='/rest/v1/bt_storage_cleanup'&&r.method()==='GET')return reply([]);
    if(u.pathname==='/rest/v1/bt_accounts'&&r.method()==='GET')return reply({version:1});
    if(u.pathname==='/auth/v1/user'&&r.method()==='GET')return reply(user);
    if(u.pathname.includes('/storage/v1/object/')&&r.method()==='GET')return route.fulfill({status:200,contentType:'image/png',body:image});
    if(u.pathname.endsWith('/bt_commit'))commits++;
    if(u.pathname.endsWith('/bt_capabilities'))capabilities++;
   }
   unexpected.push({origin:u.origin,path:u.pathname,method:r.method()});return route.abort();
 });
 await mkdir('test-results/compatible-rollback',{recursive:true});
 for(const width of [375,768,1440]){
   await p.setViewportSize({width,height:950});await p.goto(origin+'/apuestas');
   await expect(p.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible();
   await p.getByRole('button',{name:/Terminadas/}).click();
   await p.getByRole('button',{name:'Ver detalle',exact:true}).click();
   await expect(p.getByRole('dialog')).toContainText('No visible');
   await p.getByRole('button',{name:'Cerrar',exact:true}).click();
   await p.getByRole('button',{name:'Confirmar y registrar 1 liquidadas',exact:true}).click();
   await expect(p.getByRole('alert')).toContainText('temporalmente detenidas');
   assert.equal(commits,0);assert.equal(capabilities,0);
   await p.screenshot({path:`test-results/compatible-rollback/${width}.png`});
   await p.goto(origin+'/estadisticas');
   await expect(p.locator('.kpi').filter({hasText:'Cuota promedio'})).toContainText('No visible');
   await expect(p.locator('body')).not.toContainText('NaN');
   passed.push({width,readsAccountingHistory:true,newAutomaticImportsBlocked:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await writeFile('test-results/compatible-rollback/report.json',JSON.stringify({passed,commits,capabilities,realBackendRequests:0,errors,unexpected},null,2)+'\n');
 console.log(JSON.stringify({passed,commits,capabilities,realBackendRequests:0}));
} finally { await browser.close();await new Promise(r=>app.httpServer.close(r)); }
