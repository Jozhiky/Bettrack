import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';
const out = 'public/ocr';
await mkdir(out, { recursive: true });
await copyFile('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const name of await readdir('node_modules/tesseract.js-core'))
  if (/\.wasm(\.js)?$/.test(name))
    await copyFile(`node_modules/tesseract.js-core/${name}`, `${out}/${name}`);
for (const lang of ['spa', 'eng']) {
  const url = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${lang}.traineddata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${lang}: ${res.status}`);
  const { gzipSync } = await import('node:zlib');
  await writeFile(`${out}/${lang}.traineddata.gz`, gzipSync(Buffer.from(await res.arrayBuffer())));
}
console.log(
  'OCR local preparado: worker, WASM y modelos spa/eng. No se necesita red durante el reconocimiento.',
);
