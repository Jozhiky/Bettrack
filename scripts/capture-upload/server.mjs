import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { auditPlugin } from '../ocr-phase1/instrumentation.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export async function createCaptureQaServer(port = 0) {
  return createServer({
    root,
    configFile: false,
    cacheDir: 'node_modules/.vite-capture-upload',
    optimizeDeps: {
      entries: ['tests/capture-upload/browser.tsx'],
      include: ['react', 'react-dom/client', 'dexie', 'fake-indexeddb/auto', 'tesseract.js', 'zod'],
    },
    plugins: [
      {
        name: 'capture-upload-isolated-only',
        enforce: 'pre',
        transform(code, id) {
          const path = id.split('?')[0].replaceAll('\\', '/');
          if (path.endsWith('/src/data/cloudStore.ts'))
            return `export * from '/tests/capture-upload/adapter.ts';`;
          if (path.endsWith('/src/app/context.tsx'))
            return `export * from '/tests/capture-upload/context.tsx';`;
          if (path.endsWith('/src/app/auth.tsx'))
            return `export const useAuth=()=>({user:{id:'synthetic-qa'}});`;
        },
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url !== '/' && req.url !== '/__capture_qa') return next();
            res.setHeader('Content-Type', 'text/html');
            // Also protects the interactive demo, outside Playwright's network guard.
            res.setHeader(
              'Content-Security-Policy',
              "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:",
            );
            res.end(
              await server.transformIndexHtml(
                req.url,
                '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BETTRACK · QA de carga aislada</title><div id="root"></div><script type="module" src="/tests/capture-upload/browser.tsx"></script></html>',
              ),
            );
          });
        },
      },
      auditPlugin({ enabled: false }),
      react(),
      tailwind(),
    ],
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
    logLevel: 'error',
  });
}
if (process.argv.includes('--serve')) {
  const server = await createCaptureQaServer(5188);
  await server.listen();
  console.log('QA aislado disponible en http://127.0.0.1:5188');
}
