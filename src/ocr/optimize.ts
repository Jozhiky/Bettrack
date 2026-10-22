export type OptimizedImage = { blob: Blob; width?: number; height?: number };
export async function optimizeImage(blob: Blob): Promise<OptimizedImage> {
  if (blob.type === 'image/webp' || blob.size < 20_000 || typeof Worker === 'undefined') return { blob };
  return new Promise(resolve => {
    let worker: Worker;
    try { worker = new Worker(new URL('./optimize.worker.ts', import.meta.url), { type: 'module' }); }
    catch { resolve({ blob }); return; }
    const finish = (result: OptimizedImage) => { clearTimeout(timeout); worker.terminate(); resolve(result); };
    const timeout = setTimeout(() => finish({ blob }), 8000);
    worker.onmessage = event => finish(event.data);
    worker.onerror = () => finish({ blob });
    worker.postMessage(blob);
  });
}
