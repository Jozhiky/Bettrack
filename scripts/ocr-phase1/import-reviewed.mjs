// Data sanitization, not image synthesis: remove nonessential PNG metadata
// without changing IDAT pixels. Only use after visually checking for PII.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const corpusPath = path.join(root, 'tests/ocr-phase1/cases.json');
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const [id, source] = process.argv.slice(2);
const entry = corpus.cases.find((c) => c.id === id);
if (!entry || !source)
  throw new Error('Usage: node scripts/ocr-phase1/import-reviewed.mjs <case-id> <reviewed.png>');
const input = await readFile(source);
if (input.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG required');
const allowed = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'sRGB', 'gAMA', 'cHRM']);
const parts = [input.subarray(0, 8)];
let offset = 8;
while (offset < input.length) {
  const size = input.readUInt32BE(offset);
  const type = input.toString('ascii', offset + 4, offset + 8);
  const end = offset + 12 + size;
  if (end > input.length) throw new Error('Truncated PNG');
  if (allowed.has(type)) parts.push(input.subarray(offset, end));
  offset = end;
}
const output = Buffer.concat(parts);
await mkdir(path.join(root, 'tests/ocr-phase1/images'), { recursive: true });
await writeFile(path.join(root, 'tests/ocr-phase1', entry.image), output);
entry.sha256 = createHash('sha256').update(output).digest('hex');
entry.privacy =
  'Revisión visual: sin titular, usuario, correo, ID de boleto, QR ni credenciales. Metadatos PNG no esenciales eliminados; píxeles preservados.';
await writeFile(corpusPath, JSON.stringify(corpus, null, 2) + '\n');
console.log(`${id}: imported ${output.length} bytes; no source path retained`);
