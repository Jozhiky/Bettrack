import { parseTicket, type ParsedTicket } from './parser';
import { selectionSchema } from '../domain/model';
import type { createRecognizer } from './engine';
export function completeness(p: ParsedTicket) {
  const valid = p.selections.filter(
    (s) => selectionSchema.safeParse({ ...s, id: 'ocr', betId: 'ocr' }).success,
  ).length;
  return (
    [p.house, p.kind, p.stake, p.odds, p.potential].filter((v) => v !== undefined && v !== '')
      .length *
      20 +
    (valid > 0 ? 20 : 0) +
    (p.expectedSelections && valid === p.expectedSelections ? 30 : 0) +
    (p.expectedSelections ? Math.min(valid / p.expectedSelections, 1) * 10 : Math.min(valid, 10))
  );
}
export async function readCapture(
  reader: Awaited<ReturnType<typeof createRecognizer>>,
  file: Blob,
  progress: (p: number) => void,
  enhanced = false,
) {
  let latest = 0;
  const report = (value: number) => {
    latest = Math.max(latest, value);
    progress(latest);
  };
  const first = await reader.recognize(file, (p) => report(Math.round(p * 0.7)));
  let parsed = parseTicket(first.text, first.lines, first.symbols);
  if (enhanced || completeness(parsed) < 150) {
    const second = await reader.recognize(
      file,
      (p) => report(70 + Math.round(p * 0.29)),
      undefined,
      true,
    );
    const alternative = parseTicket(second.text, second.lines, second.symbols);
    if (completeness(alternative) > completeness(parsed)) parsed = alternative;
  }
  progress(100);
  return parsed;
}
