// Real local screenshots as opt-in regression fixtures; never uploaded to cloud.
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory=process.argv[2];
if(!directory) throw new Error('Usage: node scripts/verify-betano-ocr.mjs <originals-directory>');
const cases=[
  {file:'bet (30).png',count:11,stake:200,odds:51.53,potential:10307,builders:14},
  {file:'bet (27).png',count:1,stake:700,odds:1.44,potential:1008,builders:0},
  {file:'bet (23).png',count:11,stake:150,odds:46,potential:6901,builders:16},
  {file:'bet (21).png',count:18,stake:150,odds:61.62,potential:9243,builders:0},
  {file:'bet (20).png',count:22,stake:110,odds:717.29,potential:78902,builders:10},
  {file:'bet (11).png',count:12,stake:100,odds:95518.2,potential:9551820,builders:0},
  {file:'bet (18).png',count:12,stake:500,odds:22.46,potential:11232,builders:2},
];
const browser=await chromium.launch();
const reports=[];
try {
  const page=await browser.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:5186/');
  // Compare the previous per-upload initialization with the queue's reused
  // worker, validating the exact same original screenshots in both modes.
  for(const mode of ['cold', 'session']) {
  for(const fixture of cases){
    const data=(await readFile(path.join(directory,fixture.file))).toString('base64');
    const result=await page.evaluate(async ({data,mode})=>{
      const {createRecognizer}=await import('/src/ocr/engine.ts');
      const {createOcrSession}=await import('/src/ocr/session.ts');
      const {readCapture}=await import('/src/ocr/readCapture.ts');
      const {selectionSchema}=await import('/src/domain/model.ts');
      const blob=await(await fetch('data:image/png;base64,'+data)).blob();
      const started=performance.now();
      const recognize=async reader=>{
        const parsed=await readCapture(reader,blob,()=>{});
        return {parsed,elapsedMs:Math.round(performance.now()-started),valid:parsed.selections.every(s=>selectionSchema.safeParse({...s,id:'ocr',betId:'ocr'}).success)};
      };
      if(mode==='session') {
        window.__ocrSession ??= createOcrSession();
        return window.__ocrSession.run(recognize);
      }
      const reader=await createRecognizer();
      try { return await recognize(reader); }
      finally { await reader.terminate(); }
    },{data,mode});
    const p=result.parsed;
    assert(result.valid,`${fixture.file}: incomplete selection`);
    assert.equal(p.selections.length,fixture.count,fixture.file);
    for(const key of ['stake','odds','potential']) assert.equal(p[key],fixture[key],`${fixture.file}: ${key}`);
    assert.equal(p.selections.reduce((sum,s)=>sum+(s.builderMarkets?.length??0),0),fixture.builders,fixture.file);
    assert(p.selections.every(s=>s.event.includes(' vs. ')));
    if(fixture.file==='bet (30).png'){
      assert.equal(p.selections[0].event,'FC Porto vs. PSV Eindhoven');
      assert.equal(p.selections[1].event,'AS Roma vs. SK Slovan Bratislava');
      assert.equal(p.selections[2].event,'Manchester City vs. AEK Atenas');
      assert.equal(p.selections[3].builderMarkets[1].pick,'Paris Saint-Germain +2');
      assert.equal(p.selections[3].builderMarkets[1].market,'Hándicap Resultado del Partido');
      assert.equal(p.selections[3].builderMarkets[1].promotion,undefined);
      assert.equal(p.cashoutOffer,200);
      assert.equal(p.date,undefined);
    }
    reports.push({mode,file:fixture.file,elapsedMs:result.elapsedMs,valid:result.valid,parsed:p});
    console.log(`${mode} ${fixture.file}: ${result.elapsedMs} ms, ${p.selections.length} selections, ${fixture.builders} builder markets, amounts verified`);
  }
  }
  await page.evaluate(()=>window.__ocrSession?.dispose());
  const total=mode=>reports.filter(r=>r.mode===mode).reduce((sum,r)=>sum+r.elapsedMs,0);
  console.log(JSON.stringify({coldMs:total('cold'),sessionMs:total('session'),reductionPercent:Math.round((1-total('session')/total('cold'))*100)}));
  await mkdir('artifacts/ocr',{recursive:true});
  await writeFile('artifacts/ocr/betano-regression.json',JSON.stringify({verifiedAt:new Date().toISOString(),reports},null,2));
} finally {await browser.close();}
