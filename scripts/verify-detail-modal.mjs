// Isolated UI fixture: the real BetDetail and stylesheet, no account or cloud writes.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/src/app/context.tsx') return route.fulfill({ contentType: 'text/javascript', body: `
      export const useApp = () => window.__fixture;
      export const useModalError = () => null;
    ` });
    if (url.pathname === '/__modal-qa') return route.fulfill({ contentType: 'text/html', body: `
      <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
      await import('/src/styles.css');
      await import('/src/visual-system.css');
      const {BetDetail} = await import('/src/components/BetDetail.tsx');
      const now = '2026-10-20T05:00:00.000Z';
      window.__fixture = {run: async () => true, data: {
        bets:[{id:'fixture',date:now,dateSource:'upload',timingUnknown:true,houseId:'house',streamerId:'',kind:'Combinada',live:false,odds:51.53,stake:200,potential:10307,notes:'Captura de prueba de interfaz. No se guarda ninguna apuesta.',source:'ocr',fingerprint:'',createdAt:now,updatedAt:now}],
        houses:[{id:'house',name:'Betano',currency:'PEN'}],streamers:[],settlements:[],movements:[],
        selections:Array.from({length:18},(_,i)=>({id:String(i),betId:'fixture',event:'Equipo local vs. Equipo visitante',sport:'Fútbol',league:'',market:i%2?'Bet Builder':'Resultado del partido',pick:'Equipo local',odds:1.57,builderMarkets:i%2?[{market:'Goles totales Más/Menos',pick:'Más de 1.5'},{market:'Tiros al Arco',pick:'Más de 9.5'}]:undefined}))
      }};
      function App(){const [open,setOpen]=React.useState(false);return React.createElement(React.Fragment,null,
        React.createElement('main',{style:{padding:24,minHeight:1400}},React.createElement('h1',null,'Mis apuestas'),React.createElement('button',{onClick:()=>setOpen(true)},'Abrir detalle')),
        open && React.createElement(BetDetail,{betId:'fixture',onClose:()=>setOpen(false)}));}
      createRoot(document.getElementById('root')).render(React.createElement(App));
      </script></body></html>` });
    return route.continue();
  });
  const results=[];
  await mkdir('test-results', {recursive:true});
  for(const width of [375,768,1440]) {
    await page.setViewportSize({width,height:950});
    await page.goto('http://127.0.0.1:5186/__modal-qa');
    const opener=page.getByRole('button',{name:'Abrir detalle'});
    await opener.click();
    const dialog=page.getByRole('dialog',{name:'Detalle de apuesta'});
    await expect(dialog).toBeVisible();
    const rect=await dialog.boundingBox();
    expect(Math.abs(rect.x+rect.width/2-width/2)).toBeLessThan(2);
    expect(Math.abs(rect.y+rect.height/2-950/2)).toBeLessThan(2);
    expect(rect.x).toBeGreaterThan(8);
    expect(rect.y).toBeGreaterThan(8);
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    const close=dialog.getByRole('button',{name:'Cerrar',exact:true});
    await expect(dialog.getByRole('button',{name:'Ganada',exact:true})).toBeInViewport();
    await dialog.getByRole('button',{name:'Cashout',exact:true}).click();
    const cashout = page.getByRole('region',{name:'Registrar cashout'});
    await expect(cashout).toBeVisible();
    await expect(cashout.getByRole('textbox',{name:'Monto cobrado'})).toBeFocused();
    await cashout.getByRole('button',{name:'Cancelar'}).click();
    await expect(cashout).toHaveCount(0);
    await dialog.locator('.ticket-selections > summary').click();
    const before=await close.boundingBox();
    await dialog.locator('.modal-body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await expect(dialog.getByRole('button',{name:'Editar apuesta'})).toBeInViewport();
    expect(await close.boundingBox()).toEqual(before);
    await page.screenshot({path:'test-results/detail-bottom-'+width+'.png'});
    await close.click();
    await expect(opener).toBeFocused();
    await opener.click();
    await page.screenshot({path:'test-results/detail-'+width+'.png'});
    for(let i=0;i<12;i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    results.push({width,centered:true,internalScroll:true,closeAlwaysVisible:true,focusTrap:true,escape:true});
  }
  expect(errors).toEqual([]);
  await writeFile('test-results/detail-modal.json',JSON.stringify({verifiedAt:new Date().toISOString(),results,errors},null,2));
  console.log(results);
} finally {await browser.close();}
