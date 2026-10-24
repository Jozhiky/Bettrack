import { findSymbols, type SymbolCandidate } from './symbols';
import type { OcrLine } from './layout';
import { betanoHeader } from './header';
import { readVisualMode } from './visualMode';
const imageSymbols = new WeakMap<HTMLCanvasElement, SymbolCandidate[]>();
export async function hashImage(blob: Blob) {
  const bytes = await blob.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function preprocess(
  file: Blob,
  crop?: { x: number; y: number; width: number; height: number },
  enhanced = false,
) {
  const bitmap = await createImageBitmap(file);
  try {
    const c = crop ?? { x: 0, y: 0, width: 100, height: 100 };
    const sx = (bitmap.width * c.x) / 100,
      sy = (bitmap.height * c.y) / 100,
      sw = (bitmap.width * c.width) / 100,
      sh = (bitmap.height * c.height) / 100;
    // Narrow, tall tickets need larger glyphs, not a height-based downscale.
    const scale = Math.min(4, Math.max(1, 1200 / sw), Math.sqrt(24_000_000 / (sw * sh)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0,
      samples = 0;
    for (let y = Math.floor(canvas.height * 0.15); y < canvas.height * 0.9; y += 12)
      for (let x = Math.floor(canvas.width * 0.15); x < canvas.width * 0.85; x += 12) {
        const i = (y * canvas.width + x) * 4;
        const gray = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
        if (gray < 100) dark++;
        samples++;
      }
    const inverted = dark / Math.max(1, samples) > 0.55;
    const symbols = inverted ? findSymbols(pixels) : [];
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2];
      const value = inverted
        ? Math.max(0, Math.min(255, (190 - gray) * 2.6))
        : Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128));
      pixels.data[i] =
        pixels.data[i + 1] =
        pixels.data[i + 2] =
          enhanced ? (value < 160 ? 0 : 255) : value;
    }
    ctx.putImageData(pixels, 0, 0);
    // Mask only compact colored badges, so OCR cannot turn +2 icons into names.
    ctx.fillStyle = 'white';
    for (const s of symbols)
      ctx.fillRect(s.bbox.x0, s.bbox.y0, s.bbox.x1 - s.bbox.x0, s.bbox.y1 - s.bbox.y0);
    imageSymbols.set(canvas, symbols);
    return canvas;
  } finally {
    bitmap.close();
  }
}
export async function createRecognizer() {
  let report: (p: number) => void = () => {};
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker(['spa', 'eng'], 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    cacheMethod: 'none',
    errorHandler: () => {
      /* The rejected operation is handled by the review screen. */
    },
    logger: (m) => {
      if (m.status === 'recognizing text') report(Math.round(m.progress * 100));
    },
  });
  return {
    async recognize(
      file: Blob,
      progress: (p: number) => void,
      crop?: { x: number; y: number; width: number; height: number },
      enhanced = false,
    ) {
      report = progress;
      try {
        const image = await preprocess(file, crop, enhanced);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: '1',
        });
        const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
        const lines: OcrLine[] = (data.blocks ?? [])
          .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
          .map((line) => ({
            text: line.text,
            confidence: line.confidence,
            bbox: line.bbox,
            words: line.words.map((w) => ({
              text: w.text,
              confidence: w.confidence,
              bbox: w.bbox,
            })),
          }));
        const header = lines.find((l) => betanoHeader(l.text));
        if (header && !/betano|bet\s*365/i.test(data.text)) {
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
          const logo = await worker.recognize(
            image,
            {
              rectangle: {
                left: 0,
                top: 0,
                width: Math.round(image.width * 0.5),
                height: Math.max(1, Math.round(header.bbox.y0 * 0.85)),
              },
            },
            { text: true, blocks: true },
          );
          lines.push(
            ...(logo.data.blocks ?? [])
              .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
              .map((l) => ({
                text: l.text,
                confidence: l.confidence,
                bbox: l.bbox,
                words: l.words.map((w) => ({
                  text: w.text,
                  confidence: w.confidence,
                  bbox: w.bbox,
                })),
              })),
          );
        }
        const expected = betanoHeader(header?.text ?? '')?.expectedSelections ?? 0;
        const numeric = lines
          .flatMap((l) => l.words)
          .filter((w) => w.bbox.x0 > image.width * 0.8 && /^\d+[.,]\d{2}$/.test(w.text));
        if (expected && numeric.length < expected + 1) {
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
          const retry = await worker.recognize(image, {}, { text: true, blocks: true });
          for (const word of (retry.data.blocks ?? []).flatMap((b) =>
            b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
          )) {
            if (
              word.bbox.x0 > image.width * 0.8 &&
              /^\d+[.,]\d{2}$/.test(word.text) &&
              !numeric.some((w) => Math.abs(w.bbox.y0 - word.bbox.y0) < 30)
            ) {
              lines.push({
                text: word.text,
                confidence: word.confidence,
                bbox: word.bbox,
                words: [{ text: word.text, confidence: word.confidence, bbox: word.bbox }],
              });
            }
          }
        }
        const symbols = imageSymbols.get(image) ?? [];
        const visualMode = header && !crop
          ? await readVisualMode(file, await hashImage(file)).catch(() => undefined)
          : undefined;
        return {
          text: lines.map((l) => l.text).join('\n'),
          confidence: data.confidence,
          lines,
          symbols,
          ...(visualMode ? { visualMode } : {}),
        };
      } finally {
        report = () => {};
      }
    },
    terminate: () => worker.terminate(),
  };
}
export async function recognize(
  file: Blob,
  progress: (p: number) => void,
  crop?: { x: number; y: number; width: number; height: number },
) {
  const session = await createRecognizer();
  try {
    return await session.recognize(file, progress, crop);
  } finally {
    await session.terminate();
  }
}
