export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBox;
}
export interface OcrLine extends OcrWord {
  words: OcrWord[];
}
export interface TicketRow {
  text: string;
  words: OcrWord[];
  y: number;
}

// Tesseract's sparse output follows blocks, not visual reading order. Reassemble
// rows from glyph coordinates so the odds column stays with its selection.
export function visualRows(lines: OcrLine[]): TicketRow[] {
  const words = lines.flatMap((l) => l.words).filter((w) => w.text.trim());
  const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const tolerance = (heights[Math.floor(heights.length / 2)] || 20) * 0.6;
  const rows: TicketRow[] = [];
  for (const line of [...lines].sort((a, b) => a.bbox.y0 + a.bbox.y1 - (b.bbox.y0 + b.bbox.y1))) {
    const y = (line.bbox.y0 + line.bbox.y1) / 2;
    const row = rows.find((r) => Math.abs(r.y - y) <= tolerance);
    if (row) row.words.push(...line.words);
    else rows.push({ text: '', words: [...line.words], y });
  }
  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) => ({
      ...r,
      words: r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0),
      text: r.words.map((w) => w.text).join(' '),
    }));
}
