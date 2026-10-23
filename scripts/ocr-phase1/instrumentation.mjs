// This Vite plugin is used only by the isolated audit server. Files on disk
// and the production build are untouched. Fail closed if source anchors drift.
function once(source, before, after) {
  if (source.split(before).length !== 2)
    throw new Error(`Instrumentation anchor changed: ${before}`);
  return source.replace(before, after);
}
function wrap(source, name, phase, async = false) {
  const prefix = `${async ? 'async ' : ''}function ${name}(`;
  source = once(source, `export ${prefix}`, `${async ? 'async ' : ''}function phase1_${name}(`);
  return (
    source +
    `\nexport ${async ? 'async ' : ''}function ${name}(...args: Parameters<typeof phase1_${name}>) {
    return globalThis.__phase1.${async ? 'async' : 'sync'}('${phase}', () => phase1_${name}(...args));
  }\n`
  );
}
export function instrument(source, path) {
  if (path.endsWith('/src/ocr/engine.ts')) {
    source = wrap(source, 'preprocess', 'preprocessing', true);
    source = once(
      source,
      '  return {\n    async recognize(',
      `  const originalRecognize = worker.recognize.bind(worker);
  worker.recognize = (...args) => globalThis.__phase1.async('ocr', () => originalRecognize(...args));
  return {\n    async recognize(`,
    );
  }
  if (path.endsWith('/src/ocr/layout.ts')) source = wrap(source, 'visualRows', 'reconstruction');
  if (path.endsWith('/src/ocr/betano.ts'))
    source = wrap(source, 'parseBetanoLayout', 'reconstruction');
  if (path.endsWith('/src/ocr/parser.ts')) source = wrap(source, 'parseTicket', 'interpretation');
  if (path.endsWith('/src/ocr/markets.ts')) source = wrap(source, 'marketFamily', 'interpretation');
  return source;
}

export function auditPlugin({ enabled = true } = {}) {
  return {
    name: 'phase1-test-only',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0].replaceAll('\\', '/');
      if (path.endsWith('/src/integrations/supabase.ts'))
        return `export const supabase = new Proxy({}, { get() { throw new Error('Cloud access forbidden in OCR audit'); } });`;
      if (!enabled) return;
      const result = instrument(code.replaceAll('\r\n', '\n'), path);
      return result === code ? undefined : { code: result, map: null };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/__ocr_phase1') {
          res.setHeader('Content-Type', 'text/html');
          res.end('<!doctype html><title>Isolated OCR phase 1</title>');
        } else next();
      });
    },
  };
}
