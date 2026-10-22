import { decimal } from '../domain/model';
import type { ParsedTicket } from './parser';
import type { TicketRow } from './layout';
import type { SymbolCandidate, TicketPromotion } from './symbols';
import { betanoHeader } from './header';
import {
  isMarketLine as marketLine,
  isSelectionNotice,
  isSelectionValue,
  isMarketContinuation,
} from './markets';

const clean = (s: string) =>
  s
    .replace(/^[^\p{L}\d+−(\-]+/u, '')
    .replace(/^O\s+(?=\S)/, '')
    .replace(/\s+[#%].*$/, '')
    .trim();

// Schedule labels belong to the right-hand widget, even when sparse OCR joins
// them to a team line or drops the tilde in "Mañana". Match the entire suffix
// and its position, never a team/market merely containing a date-like word.
function withoutSchedule(words: TicketRow['words'], right: number) {
  const start = words.findIndex((word, index) => {
    if (word.bbox.x0 < right * 0.68) return false;
    const suffix = words
      .slice(index)
      .map((w) => w.text)
      .join(' ')
      .replace(/\s*([/:])\s*/g, '$1');
    return /^(?:(?:hoy|ma[nñ]ana)(?:\s+\d{1,2}:\d{2})?|esta (?:noc[ht*]e|tarde|ma[nñ]ana)\s+\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2})?|\d{1,2}:\d{2})$/i.test(
      suffix,
    );
  });
  return start < 0 ? words : words.slice(0, start);
}

export function parseBetanoLayout(rows: TicketRow[], symbols: SymbolCandidate[] = []) {
  const right = Math.max(...rows.flatMap((r) => r.words.map((w) => w.bbox.x1)));
  const header = rows.findIndex((r) => betanoHeader(r.text));
  const footer = rows.findIndex(
    (r, i) => i > header && /^(apuesta|importe|ganancias potenciales)\b/i.test(r.text),
  );
  const selections: ParsedTicket['selections'] = [];
  const warnings: string[] = [];
  if (header < 0 || footer < 0) return { selections, warnings };
  const candidates = rows.slice(header + 1, footer).map((row) => {
    // Ignore pictograms on the left and score/clock widgets on the right.
    const words = withoutSchedule(
      row.words.filter((w) => w.bbox.x1 > right * 0.145),
      right,
    );
    const odd = words.find((w) => w.bbox.x0 > right * 0.8 && /^\d+[.,]\d{2}$/.test(w.text));
    const content = words.filter((w) => w !== odd && w.bbox.x0 < right * 0.8);
    const promotion = symbols.find(
      (s) =>
        s.promotion &&
        Math.abs((s.bbox.y0 + s.bbox.y1) / 2 - row.y) < (s.bbox.y1 - s.bbox.y0) * 0.7 &&
        s.bbox.x0 > right * 0.14,
    )?.promotion;
    return {
      ...row,
      text: clean(content.map((w) => w.text).join(' ')).replace(promotion ? /\s+~+$/ : /$^/, ''),
      odds: odd ? decimal(odd.text) : null,
      content,
      promotion,
    };
  });
  // Some browser OCR builds put an odds badge on its own row just below the
  // title. Attach that *read value* only when its left column is empty, the
  // immediately preceding title has no odds/market label, and the gap is at
  // most 1.25 glyph heights. Larger/ambiguous gaps remain incomplete.
  for (let i = 1; i < candidates.length; i++) {
    const row = candidates[i],
      previous = candidates[i - 1];
    const height = Math.max(...previous.content.map((w) => w.bbox.y1 - w.bbox.y0), 0);
    if (
      row.odds !== null &&
      !row.text &&
      previous.text &&
      previous.odds === null &&
      !marketLine(previous.text) &&
      row.y - previous.y <= height * 1.25
    ) {
      previous.odds = row.odds;
      row.odds = null;
    }
  }
  const body = candidates.filter(
    (r) =>
      (r.text.length > 2 || isSelectionValue(r.text)) &&
      // A live lightning icon can OCR as "4" beside the clock. Short picks
      // belong to the left selection column, not the right-hand widget.
      !(isSelectionValue(r.text) && r.content.every((w) => w.bbox.x0 >= right * 0.68)) &&
      !/^(?:hoy|ma[nñ]ana)\b/i.test(r.text),
  );
  const starts = body.flatMap((r, i) => (r.odds !== null ? [i] : []));
  for (let n = 0; n < starts.length; n++) {
    const block = body.slice(starts[n], starts[n + 1] ?? body.length);
    const title = block[0];
    const builder = /bet builder/i.test(title.text);
    const notices = block.slice(1).filter((r) => isSelectionNotice(r.text));
    const rest = block.slice(1).filter((r) => !isSelectionNotice(r.text));
    for (const notice of notices)
      warnings.push(
        `Selección ${n + 1}: ${notice.text}. Este aviso no liquida el boleto completo.`,
      );
    let event = '',
      market = '',
      pick = title.text;
    let builderMarkets: { market: string; pick: string; promotion?: TicketPromotion }[] | undefined;
    if (builder) {
      // Teams precede the indented market rows; each child remains structured.
      const teams = rest.slice(0, 2);
      event = teams.length === 2 ? teams.map((r) => r.text).join(' vs. ') : '';
      builderMarkets = [];
      for (const row of rest.slice(2)) {
        const previous = builderMarkets.at(-1);
        // A wrapped player/team qualifier remains one pick. Never join a new
        // bullet or a recognized market, even when OCR lost a closing bracket.
        const openParenthesis =
          previous &&
          (previous.pick.match(/\(/g)?.length ?? 0) > (previous.pick.match(/\)/g)?.length ?? 0);
        if (
          previous &&
          !previous.market &&
          openParenthesis &&
          !marketLine(row.text) &&
          !/^[Oo○◯]\s/.test(row.words.map((w) => w.text).join(' '))
        ) {
          previous.pick += `${previous.pick.endsWith('-') ? '' : ' '}${row.text}`;
          continue;
        }
        if (marketLine(row.text) || (previous?.market && isMarketContinuation(row.text))) {
          const last = builderMarkets.at(-1);
          if (last) last.market = [last.market, row.text].filter(Boolean).join(' ');
        } else
          builderMarkets.push({
            pick: row.text,
            market: '',
            ...(row.promotion ? { promotion: row.promotion } : {}),
          });
      }
      market = 'Bet Builder';
      pick = 'Bet Builder';
      if (
        builderMarkets.length < 2 ||
        builderMarkets.some((m) => !m.market || /^\d{2,}$/.test(m.pick))
      )
        warnings.push(`Selección ${n + 1}: revisa los mercados internos y sus líneas.`);
    } else {
      const firstTeam = rest.findIndex(
        (r, i) => !marketLine(r.text) && !(i > 0 && isMarketContinuation(r.text)),
      );
      const marketRows = firstTeam < 0 ? rest : rest.slice(0, firstTeam);
      market = marketRows.map((r) => r.text).join(' ');
      const teams = firstTeam < 0 ? [] : rest.slice(firstTeam);
      event = teams.length === 2 ? teams.map((r) => r.text).join(' vs. ') : '';
    }
    if (!event || !market)
      warnings.push(`Selección ${n + 1}: evento o mercado incompleto; compáralo con la captura.`);
    if (block.some((r) => r.content.some((w) => w.confidence < 75)))
      warnings.push(`Selección ${n + 1}: hay texto de baja confianza; revisa nombres y líneas.`);
    selections.push({
      event,
      market,
      pick,
      odds: title.odds,
      sport: '',
      league: '',
      ...(title.promotion ? { promotion: title.promotion } : {}),
      ...(builderMarkets ? { builderMarkets } : {}),
    });
  }
  if (selections.some((s) => s.promotion || s.builderMarkets?.some((m) => m.promotion)))
    warnings.push(
      'Se detectaron promociones por sus iconos. Confírmalas en cada selección: no indican que ya se haya cobrado ni ganado.',
    );
  return { selections, warnings };
}
