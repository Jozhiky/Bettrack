// Frontend-only fallback: reads null historical terms, refuses new null imports.
// This command builds an isolated artifact. It never deploys or contacts Supabase.
import { build } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import './check-ocr.mjs';
const root = path.resolve('test-results/historical-compatible-rollback');
assert(root.startsWith(path.resolve('test-results') + path.sep));
let transformed = false;
await build({
  plugins: [
    {
      name: 'historical-read-compatible-fallback',
      enforce: 'pre',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/data/cloudStore.ts')) return;
        const anchor = "const capability = await supabase.rpc('bt_capabilities');";
        const accountingAnchor = "const supported = await supabase.rpc('bt_capabilities');";
        assert.equal(code.split(anchor).length, 2, 'Fallback gate anchor drift');
        assert.equal(code.split(accountingAnchor).length, 2, 'Accounting fallback gate anchor drift');
        transformed = true;
        return code
          .replace(accountingAnchor, 'const supported = {error:true,data:null};')
          .replace(
            'La importación automática necesita la actualización autorizada del esquema. El lote y sus imágenes siguen conservados.',
            'Las nuevas importaciones automáticas están temporalmente detenidas. Tus registros y capturas siguen disponibles.',
          )
          .replace(anchor, 'const capability = {error:true,data:null};')
          .replace(
            'El backend todavía no admite históricos con cuota o potencial desconocidos. Se requiere la actualización autorizada de la base de datos; tu captura sigue en revisión.',
            'Las nuevas importaciones con cuota o potencial desconocidos están temporalmente detenidas. Tus registros y capturas siguen disponibles.',
          );
      },
    },
  ],
  build: { outDir: root, emptyOutDir: true },
  logLevel: 'warn',
});
assert(transformed);
const files = {};
let js = '';
async function walk(dir = '') {
  for (const e of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const file = dir + e.name;
    if (e.isDirectory()) await walk(file + '/');
    else {
      const bytes = await readFile(path.join(root, file));
      files[file] = createHash('sha256').update(bytes).digest('hex');
      if (file.startsWith('assets/') && file.endsWith('.js')) js += bytes.toString();
    }
  }
}
await walk();
assert(js.includes('https://wfrpqzyokzrstafuqujf.supabase.co'));
assert(!/jvydvvymhtmbczuhhrzs|fake-indexeddb|btqa_[a-f0-9]{12}/.test(js));
assert(js.includes('están temporalmente detenidas'));
await writeFile(
  'test-results/historical-compatible-rollback-manifest.json',
  JSON.stringify(
    { root, files, readsUnknownTerms: true, newUnknownImportsBlocked: true },
    null,
    2,
  ) + '\n',
);
console.log(
  'Reversión compatible preparada en test-results/historical-compatible-rollback; no desplegada.',
);
