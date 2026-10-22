import type { OcrBox } from './layout';
export type TicketPromotion = 'Suplente de Oro' | 'Pago anticipado +2';
export interface SymbolCandidate {
  bbox: OcrBox;
  // Green status badges are masked too, but never imply a promotion or result.
  promotion?: TicketPromotion;
}

// Color/size candidates, not proof that an offer was executed. Review is required.
// Work on a coarse grid to bound memory even for very tall screenshots.
export function findSymbols(pixels: ImageData): SymbolCandidate[] {
  const step = 3,
    width = Math.ceil(pixels.width / step),
    height = Math.ceil(pixels.height / step);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at =
        (Math.min(y * step, pixels.height - 1) * pixels.width +
          Math.min(x * step, pixels.width - 1)) *
        4;
      const [r, g, b] = pixels.data.subarray(at, at + 3);
      if (g > 110 && b > 100 && g > r * 1.25 && g / b > 0.87 && g / b < 1.2)
        mask[y * width + x] = 1;
      else if (r > 150 && g > 120 && g / r > 0.68 && b < g * 0.75) mask[y * width + x] = 2;
      else if (g > 110 && g > r * 1.5 && g > b * 1.4) mask[y * width + x] = 3;
    }
  const result: SymbolCandidate[] = [];
  for (let at = 0; at < mask.length; at++) {
    const color = mask[at];
    if (!color) continue;
    const queue = [at];
    mask[at] = 0;
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0,
      count = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const p = queue[cursor],
        x = p % width,
        y = Math.floor(p / width);
      count++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx,
            ny = y + dy,
            n = ny * width + nx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[n] === color) {
            mask[n] = 0;
            queue.push(n);
          }
        }
    }
    const w = (x1 - x0 + 1) * step,
      h = (y1 - y0 + 1) * step;
    if (count >= 8 && w >= 15 && h >= 15 && w <= 100 && h <= 100 && w / h > 0.45 && w / h < 2.2)
      result.push({
        bbox: {
          x0: Math.max(0, x0 * step - 3),
          y0: Math.max(0, y0 * step - 3),
          x1: Math.min(pixels.width, (x1 + 1) * step + 3),
          y1: Math.min(pixels.height, (y1 + 1) * step + 3),
        },
        ...(color === 1
          ? { promotion: 'Pago anticipado +2' as const }
          : color === 2
            ? { promotion: 'Suplente de Oro' as const }
            : {}),
      });
  }
  return result;
}
