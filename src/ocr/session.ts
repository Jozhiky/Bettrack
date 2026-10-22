import { createRecognizer } from './engine';

type Reader = Awaited<ReturnType<typeof createRecognizer>>;

export function ocrConcurrency(
  hardware = navigator.hardwareConcurrency,
  memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
) {
  return hardware >= 4 && memory !== undefined && memory >= 4 ? 2 : 1;
}

// Keep the loaded language models between uploads, only in RAM. One worker
// serializes reads and is released after inactivity or when the account closes.
export function createOcrSession(factory = createRecognizer, idleMs = 120_000, taskMs = 120_000) {
  let reader: Reader | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  let disposed = false;
  let busy = false;
  const release = async () => {
    clearTimeout(idle);
    const previous = reader;
    reader = undefined;
    await previous?.terminate().catch(() => {});
  };
  return {
    run<T>(task: (reader: Reader) => Promise<T>): Promise<T> {
      const result = tail.then(async () => {
        if (disposed) throw new Error('La sesión OCR se cerró.');
        clearTimeout(idle);
        busy = true;
        let abandoned = false;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          const work = async () => {
            if (!reader) {
              const created = await factory();
              if (abandoned || disposed) {
                await created.terminate().catch(() => {});
                throw new Error('La sesión OCR se cerró.');
              }
              reader = created;
            }
            if (disposed) throw new Error('La sesión OCR se cerró.');
            return task(reader);
          };
          return await Promise.race([
            work(),
            new Promise<never>((_, reject) => {
              deadline = setTimeout(() => {
                abandoned = true;
                reject(
                  new Error(
                    'La lectura superó 2 minutos. Puedes reintentar esta captura; las demás continuarán.',
                  ),
                );
              }, taskMs);
            }),
          ]);
        } catch (error) {
          await release();
          throw error;
        } finally {
          clearTimeout(deadline);
          busy = false;
          if (disposed) await release();
          else
            idle = setTimeout(() => {
              void release();
            }, idleMs);
        }
      });
      tail = result.catch(() => {});
      return result;
    },
    dispose() {
      disposed = true;
      clearTimeout(idle);
      // Let the active read finish; its result is discarded by the account guard.
      if (!busy) void release();
    },
  };
}
