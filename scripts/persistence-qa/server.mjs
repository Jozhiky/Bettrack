import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { configuration, qaOrigin } from './target.mjs';
export async function server() {
  const config = await configuration();
  const root = path.resolve('test-results/persistence-app');
  await build({
    plugins: [
      {
        name: 'isolated-supabase-target',
        enforce: 'pre',
        transform(code, id) {
          if (!id.replaceAll('\\', '/').endsWith('/src/integrations/supabase.ts')) return;
          for (const anchor of ['supabaseUrl', 'supabaseKey'])
            if (code.split(`export const ${anchor} = `).length !== 2)
              throw Error('QA source anchor drift');
          return code
            .replace(
              /export const supabaseUrl = [^;]+;/,
              `export const supabaseUrl = ${JSON.stringify(qaOrigin)};`,
            )
            .replace(
              /export const supabaseKey = [^;]+;/,
              `export const supabaseKey = ${JSON.stringify(config.publishableKey)};`,
            );
        },
      },
    ],
    build: { outDir: root, emptyOutDir: true },
    logLevel: 'warn',
  });
  const mime = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.gz': 'application/gzip',
  };
  const instance = createServer(async (req, res) => {
    try {
      let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep) && file !== root) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!(await stat(file).catch(() => null))?.isFile()) file = path.join(root, 'index.html');
      res.setHeader('Content-Type', mime[path.extname(file)] ?? 'text/html');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'self' blob: data:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${qaOrigin} wss://${new URL(qaOrigin).host}; worker-src 'self' blob:`,
      );
      res.end(await readFile(file));
    } catch {
      res.writeHead(500);
      res.end('QA static server error');
    }
  });
  await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(5190, '127.0.0.1', resolve);
  });
  return { instance, origin: 'http://127.0.0.1:5190' };
}
if (process.argv.includes('--serve')) {
  await server();
  console.log('QA persistente aislado: http://127.0.0.1:5190');
}
