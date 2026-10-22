import { access } from 'node:fs/promises';
for (const asset of [
  'worker.min.js',
  'spa.traineddata.gz',
  'eng.traineddata.gz',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  try {
    await access(`public/ocr/${asset}`);
  } catch {
    throw new Error(`Falta OCR local: ${asset}. Ejecuta npm run assets:ocr antes de compilar.`);
  }
}
