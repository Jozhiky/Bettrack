// Isolated presentation fixture. Real components, no login, OCR or database writes.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const results = [], errors = [];
const appSource = await (await fetch('http://127.0.0.1:5186/src/app/App.tsx')).text();
const routerImport = appSource.match(/from "([^"]*react-router-dom[^\"]*)"/)[1];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/src/app/context.tsx') return route.fulfill({ contentType: 'text/javascript', body: `export const useApp=()=>window.__fixture; export const useModalError=()=>null;` });
    if (url.pathname === '/src/app/auth.tsx') return route.fulfill({ contentType: 'text/javascript', body: `export const useAuth=()=>({user:{id:'visual-fixture',user_metadata:{username:'Vista de prueba'}}});` });
    if (url.pathname === '/src/data/useCloudQuery.ts') return route.fulfill({ contentType: 'text/javascript', body: `export const useLiveQuery=(q,d,f)=>f;` });
    if (['/apuestas','/','/banca','/casas','/streamers','/estadisticas','/configuracion'].includes(url.pathname)) return route.fulfill({ contentType:'text/html', body:`
      <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
      const React=(await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      const {BrowserRouter}=await import('${routerImport}');
      await import('/src/styles.css');await import('/src/visual-system.css');
      await import('/node_modules/@fontsource/inter/latin-400.css');await import('/node_modules/@fontsource/inter/latin-600.css');await import('/node_modules/@fontsource/inter/latin-700.css');
      const {defaultSettings}=await import('/src/domain/model.ts');
      const {App}=await import('/src/app/App.tsx');
      const now='2026-10-21T15:00:00.000Z';
      const stakes=[1000,3500,2000,1000,1200,1500];
      const data={houses:[{id:'h',name:'Betano',currency:'PEN',active:true}],streamers:[],audit:[],bets:[],selections:[],settlements:[],movements:[]};
      data.bets=stakes.map((stake,i)=>({id:'ticket-'+i,houseId:'h',date:now,dateSource:'upload',timingUnknown:true,kind:i===0?'Simple':'Combinada',live:false,odds:i===0?1.57:2.43,stake,potential:Math.round(stake*(i===0?1.57:2.43)),notes:'Datos sintéticos para validar la interfaz',source:'ocr',createdAt:now,updatedAt:now}));
      data.selections=data.bets.flatMap((bet,i)=>Array.from({length:i===0?1:3},(_,n)=>({id:bet.id+'-'+n,betId:bet.id,event:['FC Porto vs. PSV Eindhoven','Paris Saint-Germain vs. FC Barcelona','Manchester City vs. AEK Atenas'][n],sport:'Fútbol',league:'',market:'Resultado del partido',pick:['FC Porto','Paris Saint-Germain','Manchester City'][n],odds:1.57})));
      data.settlements=[{id:'s3',betId:'ticket-3',date:now,kind:'Ganada',closedStake:1000,returned:3800,note:''},{id:'s4',betId:'ticket-4',date:now,kind:'Perdida',closedStake:1200,returned:0,note:''},{id:'s5',betId:'ticket-5',date:now,kind:'Cashout',closedStake:1500,returned:900,note:''}];
      data.movements=[{id:'initial',houseId:'h',date:now,kind:'Capital inicial',amount:20000},...data.bets.map(b=>({id:'m'+b.id,houseId:'h',betId:b.id,date:now,kind:'Apuesta colocada',amount:-b.stake})),...data.settlements.map(s=>({id:'m'+s.id,houseId:'h',betId:s.betId,date:now,kind:'Apuesta liquidada',amount:s.returned}))];
      window.__fixture={data,settings:defaultSettings,feedback:null,run:async()=>true,notify:()=>{}};
      createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,React.createElement(App)));
      </script></body></html>` });
    return route.continue();
  });
  await mkdir('test-results', {recursive:true});
  for (const width of [375,768,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('http://127.0.0.1:5186/apuestas');
    await expect(page.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible();
    await expect(page.locator('.overview-risk > strong')).toHaveText(/65\.00/);
    await expect(page.locator('.overview-result > strong')).toHaveText(/10\.00/);
    await expect(page.locator('.bet-card')).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('.workspace-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.screenshot({path:'test-results/visual-bets-'+width+'.png'});
    await page.getByRole('button',{name:/Todas/}).click();
    await expect(page.locator('.bet-card')).toHaveCount(6);
    await page.getByRole('button',{name:'Tabla',exact:true}).click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('button',{name:'Tarjetas',exact:true}).click();
    await page.getByRole('button',{name:'Ver detalle',exact:true}).first().click();
    const dialog=page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.screenshot({path:'test-results/visual-detail-'+width+'.png'});
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('textbox',{name:'Buscar apuestas',exact:true}).fill('NO-MATCH');
    await expect(page.getByText('Sin apuestas en esta vista',{exact:true})).toBeVisible();
    await page.goto('http://127.0.0.1:5186/');
    await expect(page.getByRole('heading',{name:'Resumen de tu banca'})).toBeVisible();
    expect(await page.locator('.workspace-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await page.screenshot({path:'test-results/visual-dashboard-'+width+'.png'});
    await page.goto('http://127.0.0.1:5186/apuestas');
    await expect(page.getByRole('heading',{name:'Mis apuestas',exact:true})).toBeVisible();
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');
    await expect(page.locator('.bet-overview')).toBeVisible();
    await expect.poll(() => page.locator('.workspace-upload-actions .secondary').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(27, 42, 53)');
    await page.screenshot({path:'test-results/visual-dark-'+width+'.png'});
    results.push({width,noOverflow:true,summary:true,filters:true,table:true,modal:true,dark:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.button').first().evaluate(e=>getComputedStyle(e).transitionDuration)).toBe('0s');
  expect(errors).toEqual([]);
  await writeFile('test-results/visual-system.json',JSON.stringify({verifiedAt:new Date().toISOString(),fixtureOnly:true,results,errors},null,2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
