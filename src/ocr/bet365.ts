import { decimal, toCents } from '../domain/model';
import type { ParsedTicket } from './parser';
import type { TicketRow } from './layout';
import type { QuotePromotion } from './quotePromotion';

// "Crear apuesta" is also bet365's product name. An odds/title row is not an
// instruction to place a new bet; nor does it prove acceptance or settlement.
export function builderProductTitle(line: string) {
  return /^(?:[✓✔vwy]+\s+)?crear apuesta\s+(?:[\d.,]+\s*)?[>»›]+\s*\d+[.,]\d{2}$/i.test(
    line.trim(),
  );
}
export function bet365SuperBoostLayout(rows: TicketRow[]) {
  const header = rows.find((r) => /^(?:[S$5]\s*\/)\s*\d+[.,]\d{2}\s+crear apuesta$/i.test(r.text));
  const titleAt = rows.findIndex((r) => builderProductTitle(r.text));
  const promoAt = rows.findIndex((r) => /^s[úu]per\s*aumento\b/i.test(r.text));
  if (!header || titleAt < 0 || promoAt <= titleAt || promoAt > titleAt + 2) return;
  const title = rows[titleAt].text,
    applied = title.match(/[>»›]+\s*(\d+[.,]\d{2})$/i);
  const stake = header.text.match(/^(?:[S$5]\s*\/)\s*(\d+[.,]\d{2})/i);
  if (!applied || !stake) return;
  const amount = toCents(stake[1]),
    odds = decimal(applied[1]);
  if (amount <= 0 || odds < 1) return;
  const children: NonNullable<ParsedTicket['selections'][number]['builderMarkets']> = [];
  let end = promoAt,
    textX = Infinity;
  for (let i = promoAt + 1; i < rows.length - 1; i++) {
    const start = rows[i].words.findIndex((w) => /^(?:m[áa]s|menos)$/i.test(w.text));
    const words = rows[i].words.slice(start);
    const pick = words.map((w) => w.text).join(' ');
    if (
      start < 0 ||
      !/^(?:m[áa]s|menos) de \d+(?:[.,]\d+)? (?:goles\b|tiros de esquina\b)/i.test(pick)
    )
      break;
    const market = rows[i + 1].text;
    if (
      !/^(?:[12][°ºªoa*"']?\s*(?:tiempo|tempo)\s*[-–]\s*)?(?:goles|tiros de esquina)\.?$/i.test(
        market,
      )
    )
      return;
    children.push({ pick, market });
    textX = Math.min(textX, words[0].bbox.x0);
    end = ++i;
  }
  if (children.length < 2) return;
  const teams = rows
    .slice(end + 1)
    .filter((r) => !/apuesta|ganancias|[S$5]\s*\//i.test(r.text) && /\p{L}/u.test(r.text));
  if (teams.length !== 2) return;
  const names = teams.map((r) =>
    r.words
      .filter((w) => w.bbox.x0 >= textX - 4)
      .map((w) => w.text)
      .join(' ')
      .trim(),
  );
  if (names.some((n) => n.length < 3)) return;
  const old = title.match(/crear apuesta\s+(\d+[.,]\d{2})\s*[>»›]/i);
  const promotion: QuotePromotion = {
    label: 'Superaumento',
    appliedOdds: odds,
    ...(old ? { originalOdds: decimal(old[1]) } : {}),
  };
  const label = rows
    .flatMap((r) => r.words.map((word) => ({ word, y: r.y })))
    .find(({ word }) => /^ganancias$/i.test(word.text));
  const money =
    label &&
    rows
      .filter((r) => r.y > label.y)
      .flatMap((r) => r.words)
      .filter(
        (w) =>
          Math.abs(w.bbox.x0 - label.word.bbox.x0) < 8 && /^[S$5]\/\d+[.,]\d{2}$/i.test(w.text),
      );
  return {
    house: 'Bet365' as const,
    houseBasis: 'superaumento-product-layout' as const,
    stake: amount,
    odds,
    kind: 'Simple' as const,
    expectedSelections: 1,
    quotePromotion: promotion,
    ...(money?.length === 1
      ? {
          displayedReturn: {
            label: 'Ganancias' as const,
            amount: toCents(money[0].text.replace(/^[S$5]\//i, '')),
            verified: false as const,
          },
        }
      : {}),
    selections: [
      {
        event: names.join(' vs. '),
        market: 'Crear apuesta',
        pick: 'Crear apuesta',
        odds,
        sport: '',
        league: '',
        builderMarkets: children,
      },
    ],
  };
}
