import { z } from 'zod';
import type { ParsedTicket } from './parser';
import { betanoHeader } from './header';
import { visualRows, type OcrLine } from './layout';
import { toCents } from '../domain/model';
import { hashImage, recognitionScale } from './engine';

const box = z
  .object({
    x0: z.number().min(0).max(1),
    y0: z.number().min(0).max(1),
    x1: z.number().min(0).max(1),
    y1: z.number().min(0).max(1),
  })
  .strict()
  .refine((b) => b.x1 > b.x0 && b.y1 > b.y0);
export const selectionResultsSchema = z
  .object({
    version: z.literal('betano-selection-results-v1'),
    imageHash: z.string().regex(/^[a-f0-9]{64}$/),
    terms: z.string().min(1).max(500000),
    marks: z
      .array(
        z
          .object({
            selection: z.number().int().min(0).max(99),
            child: z.number().int().min(0).max(99).optional(),
            status: z.enum(['lost', 'won']),
            bbox: box,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type SelectionResults = z.infer<typeof selectionResultsSchema>;
type Draft = Partial<
  Pick<
    ParsedTicket,
    'text' | 'house' | 'kind' | 'stake' | 'potential' | 'selections' | 'selectionResults'
  >
>;
export const selectionResultTerms = (d: Draft) =>
  JSON.stringify({
    text: d.text,
    house: d.house,
    kind: d.kind,
    stake: d.stake,
    potential: d.potential,
    selections: d.selections?.map((s) => ({
      event: s.event,
      market: s.market,
      pick: s.pick,
      odds: s.odds,
      promotion: s.promotion,
      builderMarkets: s.builderMarkets?.map((m) => ({
        market: m.market,
        pick: m.pick,
        promotion: m.promotion,
      })),
    })),
  });

// Evidence from a specific image AND exact OCR pass, never an editable cached result.
// Keep the raw OCR placement/header unchanged; this is a separate visual derivation.
export function verifiedSelectionResults(d: Draft) {
  const p = selectionResultsSchema.safeParse(d.selectionResults);
  if (
    !p.success ||
    p.data.terms !== selectionResultTerms(d) ||
    d.house !== 'Betano' ||
    !d.text ||
    !d.selections?.length
  )
    return;
  const lines = d.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headers = lines.filter((l) => betanoHeader(l) && /[S$5]\s*\/\s*\d+[.,]\d{2}/.test(l));
  const header = headers.length === 1 && betanoHeader(headers[0]);
  if (
    !header ||
    header.kind !== d.kind ||
    header.expectedSelections !== d.selections.length ||
    !d.stake
  )
    return;
  const amount = (s: string) => {
    try {
      return toCents(s);
    } catch {
      return undefined;
    }
  };
  if (amount(headers[0].match(/[S$5]\s*\/\s*(\d+[.,]\d{2})/)?.[1] ?? '') !== d.stake) return;
  const footer = lines.filter((l) => /^apuesta\s+(?:[S$5]\s*\/|PEN)/i.test(l));
  if (
    footer.length !== 1 ||
    amount(footer[0].match(/(?:[S$5]\s*\/|PEN)\s*(\d+[.,]\d{2})$/i)?.[1] ?? '') !== d.stake
  )
    return;
  // Systems and refunds need their own rules. Never extend the ordinary all-or-nothing rule.
  if (
    /\b(?:sistema|yankee|trixie|heinz|patent|lucky|anulad[ao]|reembols\w*|devoluci[oó]n|seguro|asegurad[ao]|parcial\w*|asi[aá]tic\w*|h[aá]ndicap|bono|freebet)\b/i.test(
      d.text,
    )
  )
    return;
  const keys = new Set<string>();
  for (const m of p.data.marks) {
    const s = d.selections[m.selection],
      key = `${m.selection}:${m.child ?? ''}`;
    if (
      !s ||
      keys.has(key) ||
      (m.child === undefined ? !!s.builderMarkets?.length : !s.builderMarkets?.[m.child])
    )
      return;
    keys.add(key);
  }
  return p.data;
}

export function visualFullLoss(d: Draft) {
  const p = verifiedSelectionResults(d);
  if (!p?.marks.some((m) => m.status === 'lost') || d.potential !== 0 || !d.text) return false;
  // This first rule covers ordinary simple/accumulator tickets, not Builder failures or promotional replacements.
  if (
    d.selections?.some((s) => s.builderMarkets?.length || s.promotion) ||
    /cash\s*out|cerrar apuesta|ganada|ganancias (?!potenciales)|importe (?:cobrado|recibido|devuelto)|retorno (?:real|realizado)|pago (?:final|realizado)/i.test(
      d.text,
    )
  )
    return false;
  return (
    d.text
      .split(/\r?\n/)
      .filter((l) => /^ganancias potenciales\s+(?:[S$5]\s*\/|PEN)\s*0[.,]00\s*$/i.test(l.trim()))
      .length === 1
  );
}

type Pixels = Pick<ImageData, 'width' | 'height' | 'data'>;
// Small filled colored circles with a DARK cross/check inside. Color alone,
// text X, scoreboards, brand artwork, promotion badges and close buttons do not qualify.
export function findResultMarks({ width: w, height: h, data }: Pixels) {
  const mask = new Uint8Array(w * h);
  for (let y = Math.floor(w * 0.2); y < h; y++)
    for (let x = Math.floor(w * 0.1); x < w * 0.8; x++) {
      const i = (y * w + x) * 4,
        r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      if (r > 170 && g < 95 && b > 20 && b < 160 && r > b * 1.5) mask[y * w + x] = 1;
      else if (g > 120 && g > r * 1.7 && g > b * 1.4) mask[y * w + x] = 2;
    }
  const result: { status: 'lost' | 'won'; bbox: SelectionResults['marks'][number]['bbox'] }[] = [];
  for (let i = 0; i < mask.length; i++) {
    const color = mask[i];
    if (!color) continue;
    const q = [i];
    mask[i] = 0;
    let x0 = w,
      x1 = 0,
      y0 = h,
      y1 = 0;
    for (let j = 0; j < q.length; j++) {
      const n = q[j],
        x = n % w,
        y = Math.floor(n / w);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const a = x + dx,
            b = y + dy,
            k = b * w + a;
          if (a >= 0 && a < w && b >= 0 && b < h && mask[k] === color) {
            mask[k] = 0;
            q.push(k);
          }
        }
    }
    const bw = x1 - x0 + 1,
      bh = y1 - y0 + 1;
    if (
      bw < w * 0.022 ||
      bw > w * 0.048 ||
      bh < w * 0.022 ||
      bh > w * 0.048 ||
      bw / bh < 0.8 ||
      bw / bh > 1.25
    )
      continue;
    const colored = new Set(q);
    const filled = (u: number, v: number) =>
      colored.has((y0 + Math.round(v * (bh - 1))) * w + x0 + Math.round(u * (bw - 1)));
    const ring = [
      [0.5, 0.07],
      [0.93, 0.5],
      [0.5, 0.93],
      [0.07, 0.5],
    ];
    if (!ring.every(([u, v]) => filled(u, v))) continue;
    const cross = [
      [0.3, 0.3],
      [0.5, 0.5],
      [0.7, 0.7],
      [0.3, 0.7],
      [0.7, 0.3],
    ];
    const crossSpaces = [
      [0.5, 0.15],
      [0.15, 0.5],
      [0.85, 0.5],
      [0.5, 0.85],
    ];
    const tick = [
      [0.25, 0.5],
      [0.4, 0.65],
      [0.6, 0.45],
      [0.75, 0.3],
    ];
    const tickSpaces = [
      [0.4, 0.3],
      [0.7, 0.65],
    ];
    const darkShape = color === 1 ? cross : tick,
      brightSpaces = color === 1 ? crossSpaces : tickSpaces;
    if (
      darkShape.filter(([u, v]) => !filled(u, v)).length < darkShape.length - 1 ||
      !brightSpaces.every(([u, v]) => filled(u, v))
    )
      continue;
    // A hollow ring can satisfy sparse samples of a cross. Compare the whole
    // interior against competing shapes as well, and require dark ticket context.
    if (color === 1) {
      const score = (shape: 'cross' | 'ring' | 'plus' | 'solid', thickness: number) => {
        let intersection = 0,
          union = 0;
        for (let y = 0; y < bh; y++)
          for (let x = 0; x < bw; x++) {
            const u = (x + 0.5) / bw,
              v = (y + 0.5) / bh,
              radius = Math.hypot(u - 0.5, v - 0.5);
            const inGlyph = u > 0.2 && u < 0.8 && v > 0.2 && v < 0.8;
            const cut =
              shape === 'cross'
                ? inGlyph && (Math.abs(u - v) < thickness || Math.abs(u + v - 1) < thickness)
                : shape === 'plus'
                  ? inGlyph && (Math.abs(u - 0.5) < thickness || Math.abs(v - 0.5) < thickness)
                  : shape === 'ring'
                    ? radius < thickness
                    : false;
            const expected = radius <= 0.5 && !cut,
              actual = colored.has((y0 + y) * w + x0 + x);
            if (expected && actual) intersection++;
            if (expected || actual) union++;
          }
        return intersection / union;
      };
      const best = Math.max(...[0.08, 0.1, 0.12, 0.15, 0.18, 0.2].map((t) => score('cross', t)));
      const other = Math.max(
        score('solid', 0),
        ...[0.2, 0.25, 0.3, 0.35].map((t) => score('ring', t)),
        ...[0.08, 0.12, 0.16, 0.2].map((t) => score('plus', t)),
      );
      if (best < 0.7 || best < other + 0.025) continue;
    }
    let dark = 0,
      border = 0;
    const padding = Math.max(2, Math.round(bw * 0.35));
    for (let y = Math.max(0, y0 - padding); y <= Math.min(h - 1, y1 + padding); y++)
      for (let x = Math.max(0, x0 - padding); x <= Math.min(w - 1, x1 + padding); x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        border++;
        const i = (y * w + x) * 4;
        if (data[i] < 100 && data[i + 1] < 110 && data[i + 2] < 130) dark++;
      }
    if (dark / border < 0.85) continue;
    result.push({
      status: color === 1 ? 'lost' : 'won',
      bbox: { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h },
    });
  }
  return result;
}

export function associateResultMarks(
  pixels: Pixels,
  d: ParsedTicket,
  lines: OcrLine[],
  ocrWidth: number,
  ocrHeight: number,
  imageHash: string,
) {
  if (d.house !== 'Betano') return;
  const clean = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const targets = d.selections.flatMap<{ selection: number; child?: number; pick: string }>(
    (s, selection) =>
      s.builderMarkets?.length
        ? s.builderMarkets.map((m, child) => ({ selection, child, pick: clean(m.pick) }))
        : [{ selection, child: undefined, pick: clean(s.pick) }],
  );
  const rows = visualRows(lines),
    marks: SelectionResults['marks'] = [];
  for (const mark of findResultMarks(pixels)) {
    const cy = ((mark.bbox.y0 + mark.bbox.y1) / 2) * ocrHeight;
    const matches = rows.filter(
      (row) =>
        row.words.length &&
        targets.some((t) => clean(row.text).includes(t.pick)) &&
        Math.abs(row.y - cy) < Math.max(...row.words.map((w) => w.bbox.y1 - w.bbox.y0)) * 0.65,
    );
    if (matches.length !== 1) continue;
    const row = matches[0],
      text = clean(row.text),
      candidates = targets.filter((t) => text.includes(t.pick));
    if (
      candidates.length !== 1 ||
      targets.filter((t) => t.pick === candidates[0].pick).length !== 1
    )
      continue;
    const left = Math.min(...row.words.map((w) => w.bbox.x0)) / ocrWidth;
    if (mark.bbox.x0 <= left || mark.bbox.x1 >= 0.8) continue;
    const { pick: _, ...target } = candidates[0];
    marks.push({ ...target, ...mark });
  }
  const proof = {
    version: 'betano-selection-results-v1' as const,
    imageHash,
    terms: selectionResultTerms(d),
    marks,
  };
  return verifiedSelectionResults({ ...d, selectionResults: proof });
}

export async function readSelectionResults(
  blob: Blob,
  d: ParsedTicket,
  lines: OcrLine[],
  imageHash?: string,
) {
  if (d.house !== 'Betano' || !lines.length) return;
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(
      2,
      720 / bitmap.width,
      Math.sqrt(2_000_000 / (bitmap.width * bitmap.height)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const ocrScale = recognitionScale(bitmap.width, bitmap.height);
    return associateResultMarks(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
      d,
      lines,
      Math.round(bitmap.width * ocrScale),
      Math.round(bitmap.height * ocrScale),
      imageHash ?? (await hashImage(blob)),
    );
  } finally {
    bitmap.close();
  }
}
