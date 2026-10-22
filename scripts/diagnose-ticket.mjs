import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('http://127.0.0.1:5186/');
 const data=(await readFile(process.argv[2])).toString('base64');
 const results=await page.evaluate(async data=>{
   const {createRecognizer}=await import('/src/ocr/engine.ts');
   const {parseTicket}=await import('/src/ocr/parser.ts');
   const {selectionSchema}=await import('/src/domain/model.ts');
   const {optimizeImage}=await import('/src/ocr/optimize.ts');
   const blob=await(await fetch('data:image/png;base64,'+data)).blob();
   const optimized=await optimizeImage(blob), reader=await createRecognizer(),results=[];
   try {for(const [mode,image,enhanced] of [['original',blob,false],['enhanced',blob,true],['stored',optimized.blob,false]]){
     const raw=await reader.recognize(image,()=>{},undefined,enhanced);
     const parsed=parseTicket(raw.text,raw.lines,raw.symbols);
     results.push({mode,bytes:image.size,parsed,errors:parsed.selections.map(s=>selectionSchema.safeParse({...s,id:'ocr',betId:'ocr'}).error?.issues),raw});
   }} finally{await reader.terminate();}
   return results;
 },data);
 await mkdir('artifacts/ocr',{recursive:true});
 await writeFile(process.argv[3] || 'artifacts/ocr/ticket-diagnostic.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({raw,...r})=>r),null,2));
} finally{await browser.close();}
