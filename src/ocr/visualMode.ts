import { z } from 'zod';

export const visualModeSchema = z
  .object({
    mode: z.literal('live'),
    basis: z.literal('betano-orange-lightning-v1'),
    imageHash: z.string().regex(/^[a-f0-9]{64}$/),
    bbox: z.object({
      x0: z.number().min(0).max(1),
      y0: z.number().min(0).max(1),
      x1: z.number().min(0).max(1),
      y1: z.number().min(0).max(1),
    }),
  })
  .strict()
  .refine((v) => v.bbox.x1 > v.bbox.x0 && v.bbox.y1 > v.bbox.y0);
export type VisualMode = z.infer<typeof visualModeSchema>;
const polygon = [
  [0.55, 0],
  [0, 0.6],
  [0.4, 0.6],
  [0.45, 1],
  [1, 0.35],
  [0.6, 0.35],
];
function inside(x: number, y: number) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = polygon[i],
      [c, d] = polygon[j];
    if (b > y !== d > y && x < ((c - a) * (y - b)) / (d - b) + a) yes = !yes;
  }
  return yes;
}
// A compact orange zigzag inside the dark right-hand event widget. Brand areas,
// circular/rectangular badges, prices and text cannot establish live placement.
// This evidence says NOTHING about placement acceptance, payout or settlement.
export function findLiveLightning(
  pixels: Pick<ImageData, 'width' | 'height' | 'data'>,
): VisualMode['bbox'] | undefined {
  const { width: w, height: h, data } = pixels,
    mask = new Uint8Array(w * h);
  // A long combination may have its only live leg near either end. Bound the
  // logo exclusion by ticket WIDTH, never by a percentage of the full height.
  for (let y = Math.floor(w * 0.12); y < h; y++)
    for (let x = Math.floor(w * 0.75); x < Math.ceil(w * 0.98); x++) {
      const p = (y * w + x) * 4,
        r = data[p],
        g = data[p + 1],
        b = data[p + 2];
      if (r > 195 && g > 35 && g < 155 && b < 115 && r > g * 1.6 && g > b * 1.15)
        mask[y * w + x] = 1;
    }
  for (let at = 0; at < mask.length; at++) {
    if (!mask[at]) continue;
    const q = [at];
    mask[at] = 0;
    let x0 = w,
      y0 = h,
      x1 = 0,
      y1 = 0;
    for (let i = 0; i < q.length; i++) {
      const p = q[i],
        x = p % w,
        y = Math.floor(p / w);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            n = ny * w + nx;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[n]) {
            mask[n] = 0;
            q.push(n);
          }
        }
    }
    const bw = x1 - x0 + 1,
      bh = y1 - y0 + 1;
    if (
      bw < w * 0.012 ||
      bw > w * 0.055 ||
      bh < w * 0.024 ||
      bh > w * 0.085 ||
      bw / bh < 0.35 ||
      bw / bh > 1
    )
      continue;
    let intersection = 0,
      union = 0,
      dark = 0,
      ring = 0;
    const component = new Set(q);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const a = component.has(y * w + x),
          b = inside((x - x0 + 0.5) / bw, (y - y0 + 0.5) / bh);
        if (a && b) intersection++;
        if (a || b) union++;
      }
    const padding = Math.max(2, Math.round(bw * 0.6));
    for (let y = Math.max(0, y0 - padding); y <= Math.min(h - 1, y1 + padding); y++)
      for (let x = Math.max(0, x0 - padding); x <= Math.min(w - 1, x1 + padding); x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        const p = (y * w + x) * 4;
        ring++;
        if (data[p] < 100 && data[p + 1] < 110 && data[p + 2] < 130) dark++;
      }
    if (intersection / union >= 0.7 && dark / ring >= 0.85)
      return { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
  }
}

// Read existing private images locally; no OCR API, network service or financial write.
export async function readVisualMode(
  blob: Blob,
  imageHash: string,
): Promise<VisualMode | undefined> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(
      1,
      720 / bitmap.width,
      Math.sqrt(2_000_000 / (bitmap.width * bitmap.height)),
    );
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    const bbox = findLiveLightning(ctx.getImageData(0, 0, c.width, c.height));
    return bbox
      ? visualModeSchema.parse({
          mode: 'live',
          basis: 'betano-orange-lightning-v1',
          imageHash,
          bbox,
        })
      : undefined;
  } finally {
    bitmap.close();
  }
}

export function captureMode(draft: { text: string; house?: string; visualMode?: VisualMode }) {
  const live =
    /\bapuesta\s+en\s+vivo\b/i.test(draft.text) ||
    (draft.house === 'Betano' && visualModeSchema.safeParse(draft.visualMode).success);
  const pre = /\bapuesta\s+(?:prematch|prepartido|pre-match)\b/i.test(draft.text);
  return live === pre ? 'unknown' : live ? 'live' : 'prematch';
}
