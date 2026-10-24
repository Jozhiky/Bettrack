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
  normalized,
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
  const reviewReasons: string[] = [];
  const fieldConfidence: ParsedTicket['confidence'] = {};
  const review = (path: string, reason: string, missing = false) => {
    fieldConfidence[path] = missing ? 'missing' : 'review';
    reviewReasons.push(reason);
  };
  if (header < 0 || footer < 0) return { selections, warnings, reviewReasons, fieldConfidence };
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
      // Tesseract can read the orange open-circle child marker as ©. Keep
      // that visible marker so a separated child never becomes an outer leg.
      bullet: /^[Oo○◯©]\s/.test(content.map((w) => w.text).join(' ')),
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
  // OCR often separates a player's parenthesized club onto the following
  // line and places the odds badge between both text lines. Recover only
  // visible, coordinate-adjacent text: never guess a missing club or odds.
  for (let i = 0; i < candidates.length; i++) {
    const title = candidates[i];
    if (
      !title.text ||
      marketLine(title.text) ||
      (title.text.match(/\(/g)?.length ?? 0) <= (title.text.match(/\)/g)?.length ?? 0)
    ) continue;
    const glyph = Math.max(...title.content.map((w) => w.bbox.y1 - w.bbox.y0), 1);
    let last = i + 1;
    while (
      last < candidates.length &&
      !candidates[last].text &&
      candidates[last].y - title.y <= glyph * 2.9
    ) last++;
    const ending = candidates[last];
    if (
      !ending ||
      ending.y - title.y > glyph * 2.9 ||
      !/^[^()]{1,70}\)$/.test(ending.text) ||
      marketLine(ending.text) ||
      !ending.content.length ||
      Math.abs(ending.content[0].bbox.x0 - title.content[0].bbox.x0) > glyph * 1.5
    ) continue;
    const floating = candidates.slice(i + 1, last + 1).filter((r) => r.odds !== null);
    if (title.odds === null && floating.length === 1) {
      title.odds = floating[0].odds;
      floating[0].odds = null;
    } else if (floating.length) {
      review(
        'selections[' + selections.length + '].odds',
        'Hay más de una cuota junto a un nombre de jugador dividido: verifica su asignación.',
      );
    }
    // Preserve a visible hyphen at the wrap; adding a space changes the name.
    title.text += (title.text.endsWith('-') ? '' : ' ') + ending.text;
    title.content.push(...ending.content);
    ending.text = '';
    ending.content = [];
  }
  const body = candidates.filter(
    (r) =>
      (r.text.length > 2 || isSelectionValue(r.text)) &&
      // A live lightning icon can OCR as "4" beside the clock. Short picks
      // belong to the left selection column, not the right-hand widget.
      !(isSelectionValue(r.text) && r.content.every((w) => w.bbox.x0 >= right * 0.68)) &&
      !/^(?:hoy|ma[nñ]ana)\b/i.test(r.text),
  );
  // An odds badge is evidence, not the definition of a leg. The first body
  // row and separated outer titles survive a missing badge. Child bullets are
  // never outer titles. Ambiguous boundaries stay in the draft for review.
  const left = (r: (typeof body)[number]) => Math.min(...r.content.map((w) => w.bbox.x0));
  const outerColumn = Math.min(...body.filter((r, i) => i === 0 || r.odds !== null).map(left));
  const starts = body.flatMap((r, i) => {
    const previous = body[i - 1];
    const height = Math.max(...r.content.map((w) => w.bbox.y1 - w.bbox.y0), 1);
    const separated = previous && r.y - previous.y > height * 2.5;
    const titleShape =
      /bet builder/i.test(r.text) ||
      (!marketLine(r.text) && !!body[i + 1] && marketLine(body[i + 1].text));
    return i === 0 ||
      (r.odds !== null &&
        (!marketLine(r.text) || (!!body[i + 1] && marketLine(body[i + 1].text)))) ||
      (separated && left(r) <= outerColumn + height * 0.5 && !r.bullet && titleShape)
      ? [i]
      : [];
  });
  for (let n = 0; n < starts.length; n++) {
    const block = body.slice(starts[n], starts[n + 1] ?? body.length);
    const title = block[0];
    const basePath = `selections[${n}]`;
    if (title.odds === null)
      review(
        `${basePath}.odds`,
        `Selección ${n + 1}: cuota ausente; se conserva sin calcularla.`,
        true,
      );
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
          !row.bullet
        ) {
          previous.pick += `${previous.pick.endsWith('-') ? '' : ' '}${row.text}`;
          continue;
        }
        if (row.bullet) {
          // A visible child bullet establishes the role even if a player's or
          // team's name contains a word from the market vocabulary.
          builderMarkets.push({
            pick: row.text,
            market: '',
            ...(row.promotion ? { promotion: row.promotion } : {}),
          });
        } else if (marketLine(row.text) || (previous?.market && isMarketContinuation(row.text))) {
          const last = builderMarkets.at(-1);
          if (last) last.market = [last.market, row.text].filter(Boolean).join(' ');
        } else if (
          previous &&
          !previous.market &&
          !row.bullet &&
          !isSelectionValue(row.text) &&
          !/^(?:mas|menos) de\b/.test(normalized(row.text))
        ) {
          // The label immediately below a pick is retained as a tentative
          // market, even outside the vocabulary. Never create a fictitious pick.
          previous.market = row.text;
          review(
            `${basePath}.builderMarkets[${builderMarkets.length - 1}].market`,
            `Selección ${n + 1}: mercado interno desconocido; revisa su texto original.`,
          );
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
      // A second unclassified player-name row can precede the actual market
      // (e.g. a replacement with a crossed-out former name). Preserve it in
      // mandatory human review, but do not misclassify it as a team/market.
      // Do not assert why it appears: OCR cannot prove strikethrough.
      const ambiguousExtra =
        title.odds !== null &&
        rest.length >= 4 &&
        !marketLine(rest[0].text) &&
        !isSelectionValue(rest[0].text) &&
        rest[0].odds === null &&
        marketLine(rest[1].text) &&
        /^[\p{L}][\p{L}\s.'’−-]+$/u.test(rest[0].text);
      if (ambiguousExtra) {
        review(
          basePath + '.pick',
          'Selección ' + (n + 1) + ': aparece «' + rest[0].text +
          '» entre el nombre principal y el mercado. Confirma a quién corresponde antes de guardar.',
        );
        rest.shift();
      }
      const firstTeam = rest.findIndex(
        (r, i) => !marketLine(r.text) && !(i > 0 && isMarketContinuation(r.text)),
      );
      // Betano places the two event participants after the market. If exactly
      // three rows remain and the label is unknown, preserve those positions
      // as a REVIEWABLE draft, not as confirmed semantic entities.
      const unknownLabel =
        firstTeam === 0 &&
        rest.length === 3 &&
        !rest.slice(-2).some((r) => marketLine(r.text) || isSelectionValue(r.text));
      // Recognized market rows followed by exactly two participants establish
      // roles before vocabulary matching. A team named "Córners FC" is not
      // absorbed into the market just because it contains a statistical word.
      const prefix = rest.slice(0, -2);
      const structuredTail =
        rest.length >= 3 &&
        marketLine(prefix[0].text) &&
        prefix.every((r, i) => marketLine(r.text) || (i > 0 && isMarketContinuation(r.text)));
      const boundary = unknownLabel ? 1 : structuredTail ? rest.length - 2 : firstTeam;
      const marketRows = boundary < 0 ? rest : rest.slice(0, boundary);
      market = marketRows.map((r) => r.text).join(' ');
      const teams = boundary < 0 ? [] : rest.slice(boundary);
      event = market && teams.length === 2 ? teams.map((r) => r.text).join(' vs. ') : '';
      if (unknownLabel) {
        review(
          `${basePath}.market`,
          `Selección ${n + 1}: mercado desconocido; se conserva el texto original para revisión.`,
        );
        fieldConfidence[`${basePath}.event`] = 'review';
      }
      if (teams.some((r) => marketLine(r.text)))
        review(
          `${basePath}.event`,
          `Selección ${n + 1}: un participante contiene una etiqueta de mercado; confirma su identidad.`,
        );
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
    for (const [field, value] of Object.entries({ event, market, pick, odds: title.odds })) {
      const path = `${basePath}.${field}`;
      fieldConfidence[path] ??= value === '' || value === null ? 'missing' : 'review';
    }
    for (const [j, child] of (builderMarkets ?? []).entries()) {
      for (const field of ['market', 'pick'] as const)
        fieldConfidence[`${basePath}.builderMarkets[${j}].${field}`] ??= child[field]
          ? 'review'
          : 'missing';
    }
  }
  if (selections.some((s) => s.promotion || s.builderMarkets?.some((m) => m.promotion)))
    warnings.push(
      'Se detectaron promociones por sus iconos. Confírmalas en cada selección: no indican que ya se haya cobrado ni ganado.',
    );
  warnings.push(...reviewReasons);
  return { selections, warnings, reviewReasons, fieldConfidence };
}
