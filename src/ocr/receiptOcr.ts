import { z } from 'zod';
import { toCents } from '../domain/model';
import { createRecognizer, hashImage } from './engine';
import { visualRows } from './layout';

// Supplemental OCR, never a replacement for the original image/text. Both
// contrast passes must read the same complete, explicitly labelled footer.
export const receiptOcrSchema = z
  .object({
    basis: z.literal('betano-footer-tesseract-v1'),
    imageHash: z.string().regex(/^[a-f0-9]{64}$/),
    text: z.string().max(4000),
    enhancedText: z.string().max(4000),
  })
  .strict();
export type ReceiptOcr = z.infer<typeof receiptOcrSchema>;

export function footerValues(text: string) {
  const match = text
    .trim()
    .match(
      /^apuesta\s+(?:[S$5]\s*\/|PEN)\s*(\d+[.,]\d{2})\s+ganancias\s+(?:[S$5]\s*\/|PEN)\s*(\d+[.,]\d{2})$/i,
    );
  if (!match) return undefined;
  try {
    return { stake: toCents(match[1]), returned: toCents(match[2]) };
  } catch {
    return undefined;
  }
}
export function agreedFooter(proof: ReceiptOcr | undefined) {
  const parsed = receiptOcrSchema.safeParse(proof);
  if (!parsed.success) return undefined;
  const first = footerValues(parsed.data.text),
    second = footerValues(parsed.data.enhancedText);
  return first && second && first.stake === second.stake && first.returned === second.returned
    ? first
    : undefined;
}

export async function readReceiptFooter(file: Blob, imageHash: string) {
  if ((await hashImage(file)) !== imageHash) throw Error('La imagen del cobro cambió.');
  const reader = await createRecognizer();
  try {
    const texts: string[] = [];
    for (const enhanced of [false, true]) {
      // Exclude the bottom coloured frame: it can turn the decimal dot into a glyph.
      const r = await reader.recognize(
        file,
        () => {},
        { x: 0, y: 70, width: 100, height: 27 },
        enhanced,
      );
      texts.push(
        visualRows(r.lines)
          .map((row) => row.text)
          .join('\n'),
      );
    }
    const proof: ReceiptOcr = {
      basis: 'betano-footer-tesseract-v1',
      imageHash,
      text: texts[0],
      enhancedText: texts[1],
    };
    return agreedFooter(proof) ? proof : undefined;
  } finally {
    await reader.terminate();
  }
}
