import { parseTicket, placementFromText, type ParsedTicket } from './parser';
import { selectionSchema } from '../domain/model';
import { hashImage, recognitionScale, type createRecognizer } from './engine';
import { agreedAutomaticEvidence } from './automaticEvidence';
import { needsReceiptRead } from './settlement';
import { readReceiptFooter } from './receiptOcr';
import { visualRows } from './layout';
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

const missingOdds = (p: ParsedTicket) => p.selections.filter((s) => s.odds === null).length;

// Null odds are valid draft data, but a spatially identified missing badge is
// incomplete OCR evidence. Do not count absent Builder-child odds or invent
// badges for the text-only fallback (which has no separate odds-column evidence).
function missingBadge(p: ParsedTicket) {
  return p.selections.some(
    (s, i) => s.odds === null && p.confidence[`selections[${i}].odds`] === 'missing',
  );
}

// A tie in the existing quality score can be broken only by actually read odds
// on otherwise identical legs. Select a whole pass; never merge or calculate odds.
function recoversOnlyOdds(first: ParsedTicket, next: ParsedTicket) {
  if (missingOdds(next) >= missingOdds(first) || first.selections.length !== next.selections.length)
    return false;
  for (const field of [
    'house',
    'kind',
    'stake',
    'odds',
    'potential',
    'cashoutOffer',
    'bonusAmount',
    'visibleStatus',
    'expectedSelections',
  ] as const)
    if (first[field] !== next[field]) return false;
  if (JSON.stringify(first.placement) !== JSON.stringify(next.placement)) return false;
  if (
    !first.selections.every(({ odds, ...leg }, i) => {
      const { odds: recovered, ...other } = next.selections[i];
      return JSON.stringify(leg) === JSON.stringify(other) && (odds === null || odds === recovered);
    })
  )
    return false;
  const resolved = new Set(
    first.selections.flatMap((s, i) =>
      s.odds === null && next.selections[i].odds !== null
        ? [`Selección ${i + 1}: cuota ausente; se conserva sin calcularla.`]
        : [],
    ),
  );
  return (first.reviewReasons ?? []).every(
    (reason) => resolved.has(reason) || next.reviewReasons?.includes(reason),
  );
}

export async function readCapture(
  reader: Awaited<ReturnType<typeof createRecognizer>>,
  file: Blob,
  progress: (p: number) => void,
  enhanced = false,
  automatic = false,
) {
  let latest = 0;
  const report = (value: number) => {
    latest = Math.max(latest, value);
    progress(latest);
  };
  const first = await reader.recognize(file, (p) => report(Math.round(p * 0.7)));
  let parsed = parseTicket(first.text, first.lines, first.symbols, first.visualMode);
  const initial = parsed;
  let alternate: ParsedTicket | undefined;
  if (automatic || enhanced || completeness(parsed) < 150 || missingBadge(parsed)) {
    const second = await reader.recognize(
      file,
      (p) => report(70 + Math.round(p * 0.29)),
      undefined,
      automatic ? 'soft' : true,
    );
    const alternative = parseTicket(second.text, second.lines, second.symbols, second.visualMode);
    alternate = alternative;
    // A reread cannot erase an observed global settlement or a placement conflict.
    const retainsSafety =
      (!parsed.visibleStatus || alternative.visibleStatus === parsed.visibleStatus) &&
      (parsed.placement?.basis !== 'conflicting' ||
        alternative.placement?.basis === 'conflicting') &&
      (parsed.placement?.status !== 'preparation' ||
        alternative.placement?.status === 'preparation');
    const before = completeness(parsed),
      after = completeness(alternative);
    if (
      retainsSafety &&
      (after > before || (after === before && recoversOnlyOdds(parsed, alternative)))
    )
      parsed = alternative;
  }
  if (automatic && alternate) {
    const imageHash = await hashImage(file);
    if (needsReceiptRead(parsed)) {
      const receipt = await readReceiptFooter(file, imageHash).catch(() => undefined);
      if (receipt) {
        initial.receiptOcr = receipt;
        alternate.receiptOcr = receipt;
        parsed.receiptOcr = receipt;
      }
    }
    let proof = agreedAutomaticEvidence(initial, alternate, imageHash);
    if (
      !proof &&
      initial.cashoutOffer !== undefined &&
      alternate.cashoutOffer === undefined &&
      !initial.reviewReasons?.length &&
      !alternate.reviewReasons?.length
    ) {
      const row = visualRows(first.lines).find(
        (row) =>
          placementFromText(row.text).basis === 'cashout-available' &&
          parseTicket(row.text).cashoutOffer === initial.cashoutOffer,
      );
      if (row?.words.length) {
        const bitmap = await createImageBitmap(file);
        let crop;
        try {
          const scale = recognitionScale(bitmap.width, bitmap.height),
            width = Math.round(bitmap.width * scale),
            height = Math.round(bitmap.height * scale);
          const glyph = Math.max(...row.words.map((w) => w.bbox.y1 - w.bbox.y0));
          const x = Math.max(0, Math.min(...row.words.map((w) => w.bbox.x0)) - glyph),
            y = Math.max(0, Math.min(...row.words.map((w) => w.bbox.y0)) - glyph * 0.55);
          const right = Math.min(width, Math.max(...row.words.map((w) => w.bbox.x1)) + glyph),
            bottom = Math.min(height, Math.max(...row.words.map((w) => w.bbox.y1)) + glyph * 0.55);
          crop = {
            x: (x / width) * 100,
            y: (y / height) * 100,
            width: ((right - x) / width) * 100,
            height: ((bottom - y) / height) * 100,
          };
        } finally {
          bitmap.close();
        }
        const footer = await reader.recognize(file, () => {}, crop, true);
        const text = footer.lines.length
          ? visualRows(footer.lines)
              .map((row) => row.text)
              .join('\n')
          : footer.text;
        proof = agreedAutomaticEvidence(initial, alternate, imageHash, text);
      }
    }
    if (proof) parsed.automaticEvidence = proof;
  }
  progress(100);
  return parsed;
}
