import { decimal, toCents } from '../domain/model';
import { selectAdapter } from './adapters';
import { visualRows, type OcrLine } from './layout';
import { parseBetanoLayout } from './betano';
import { betanoHeader, settledTicketHeader } from './header';
import type { SymbolCandidate, TicketPromotion } from './symbols';
import { normalized } from './markets';
import type { MarketInterpretation } from './semantics';
import { interpretSelections, semanticReviewReasons } from './semanticReview';
import { classifyPlacement, type PlacementEvidence } from './placement';
import { visualModeSchema, type VisualMode } from './visualMode';
export interface ParsedTicket {
  house?: string;
  kind?: string;
  stake?: number;
  odds?: number;
  potential?: number;
  cashoutOffer?: number;
  visibleStatus?: string;
  expectedSelections?: number;
  bonusAmount?: number;
  visualMode?: VisualMode;
  // Draft-only metadata; does not change historical selection schemas.
  placement?: PlacementEvidence;
  reviewReasons?: string[];
  interpretations?: { path: string; value: MarketInterpretation }[];
  selections: {
    event: string;
    market: string;
    pick: string;
    odds: number | null;
    sport: string;
    league: string;
    promotion?: TicketPromotion;
    builderMarkets?: { market: string; pick: string; promotion?: TicketPromotion }[];
  }[];
  warnings: string[];
  confidence: Record<string, 'high' | 'review' | 'missing'>;
  text: string;
}
const numberToken = '([0-9]+(?:[.,][0-9]+)*)';
function labeled(text: string, labels: string[], money = false) {
  for (const label of labels) {
    const match = text.match(
      new RegExp(`(?:${label})\\s*[:=]?\\s*(?:[S$5]\\s*\\/|PEN|€|\\$)?\\s*${numberToken}`, 'im'),
    );
    if (match) {
      try {
        return money ? toCents(match[1]) : decimal(match[1]);
      } catch {
        /* keep missing */
      }
    }
  }
}

function availableCashout(text: string, lines: string[]) {
  // Explicit CASH OUT + amount is evidence of an offer, never of execution.
  const explicit = labeled(text, ['^cash\\s*ou[tIi](?:\\s+(?:disponible|ofrecido))?'], true);
  if (explicit !== undefined) return explicit;
  // Generic action buttons also occur while creating a bet. Accept their
  // amount only beside an explicit availability label, not an execution label.
  if (
    lines.some((line) => /^(?:crear|confirmar|realizar|colocar) apuesta\b/.test(normalized(line)))
  )
    return undefined;
  for (let i = 0; i < lines.length; i++) {
    if (!/^(?:cerrar apuesta|cobrar)\b/.test(normalized(lines[i]))) continue;
    const context = lines.slice(Math.max(0, i - 2), i).map(normalized);
    if (
      context.some((line) => /^cash\s*out\s+(?:disponible|ofrecido)\s*:?$/.test(line)) &&
      !context.some((line) => /cash\s*out\s+(?:ejecutado|realizado|cobrado)/.test(line))
    ) {
      const offer = labeled(lines.slice(i, i + 2).join('\n'), ['^cerrar apuesta', '^cobrar'], true);
      if (offer !== undefined) return offer;
    }
  }
}

// Reusable at the write boundary. Recompute from raw OCR rather than trusting
// cached placement/confidence/cashout fields in an older draft.
export function placementFromText(text: string): PlacementEvidence {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return classifyPlacement(text, availableCashout(text, lines) !== undefined);
}
export function classifyMarket(text: string) {
  const t = normalized(text);
  const scope = /equipo|local|visitante/.test(t) ? 'equipo' : 'partido';
  const period = /primer tiempo|1[ºo]? tiempo|1st half/.test(t)
    ? 'primer tiempo'
    : /segundo tiempo|2nd half/.test(t)
      ? 'segundo tiempo'
      : 'partido completo';
  const category = /tiros? al arco|remates? a puerta|shots on target/.test(t)
    ? 'Tiros al arco'
    : /remates?|shots/.test(t)
      ? 'Remates'
      : /c[oó]rners?|corners/.test(t)
        ? 'Córners'
        : /ambos.*anotan|both teams/.test(t)
          ? 'Ambos equipos anotan'
          : /doble oportunidad|double chance/.test(t)
            ? 'Doble oportunidad'
            : /h[aá]ndicap|handicap/.test(t)
              ? 'Hándicap'
              : /asi[aá]tico|asian/.test(t)
                ? 'Total asiático'
                : /goles?|goals/.test(t)
                  ? 'Goles'
                  : undefined;
  return category ? `${category} · ${scope} · ${period}` : undefined;
}
export function parseTicket(
  rawText: string,
  geometry: OcrLine[] = [],
  symbols: SymbolCandidate[] = [],
  visualMode?: VisualMode,
): ParsedTicket {
  const rows = visualRows(geometry);
  const text = rows.length ? rows.map((r) => r.text).join('\n') : rawText;
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const adapter = selectAdapter(text);
  const house = adapter.name === 'Genérico' ? undefined : adapter.name;
  const header = lines.find((l) => betanoHeader(l));
  const headerInfo = betanoHeader(header ?? '');
  const headerMoney = header?.match(/[S$5]\s*\/\s*(\d+[.,]\d{2})/i);
  const headerOdds = header?.match(
    /[S$5]\s*\/\s*\d+[.,]\d{2}\s+(?:[^\d\n]+\s+)?(\d+(?:[.,]\d+)+)\s*$/i,
  );
  const stake =
    labeled(text, adapter.stake, true) ?? (headerMoney ? toCents(headerMoney[1]) : undefined);
  const odds = labeled(text, adapter.odds) ?? (headerOdds ? decimal(headerOdds[1]) : undefined);
  const potential = labeled(text, adapter.potential, true);
  const cashoutOffer = availableCashout(text, lines);
  const layout = house === 'Betano' && rows.length ? parseBetanoLayout(rows, symbols) : undefined;
  const bonusAmount = labeled(text, ['bono\\s*\\+?'], true);
  const selections: ParsedTicket['selections'] = layout?.selections ?? [];
  const hasLayoutSelections = selections.length > 0;
  for (let i = 0; i < lines.length; i++) {
    if (
      !hasLayoutSelections &&
      /\s(?:vs?\.?|[-–])\s/i.test(lines[i]) &&
      !/S\s*\/|goles|remates|tiros|c[oó]rners|h[aá]ndicap|tarjetas/i.test(lines[i])
    ) {
      const nearby = lines
        .slice(i + 1, i + 5)
        .filter((l) => !/importe|retorno|cuota total|cash.?out/i.test(l));
      const market = nearby.find((l) => classifyMarket(l)) || '';
      const pick = nearby.find((l) => l !== market && !/^\d+[.,]\d+$/.test(l)) || '';
      const oddLine = nearby.find((l) => /^\d+[.,]\d+$/.test(l));
      selections.push({
        event: lines[i],
        market,
        pick,
        odds: oddLine ? decimal(oddLine) : null,
        sport: '',
        league: '',
      });
    }
  }
  const warnings = [
    'Verifica cada selección: se conserva el texto visible sin inferir equipos, periodos ni mercados.',
  ];
  if (!selections.length && !header) {
    const playerMarket = rows.findIndex((r) =>
      /^.+\s+(tiros al arco|remates totales|tiros totales)\s*$/i.test(r.text),
    );
    const previous = rows[playerMarket - 1];
    const pick = previous?.text.replace(/^[Oo]\s+/, '').trim();
    if (playerMarket > 0 && pick && /^\d+\+$/.test(pick)) {
      const promotion = symbols.find(
        (s) =>
          s.promotion && Math.abs((s.bbox.y0 + s.bbox.y1) / 2 - previous.y) < s.bbox.y1 - s.bbox.y0,
      )?.promotion;
      selections.push({
        event: '',
        market: rows[playerMarket].text,
        pick,
        odds: null,
        sport: '',
        league: '',
        ...(promotion ? { promotion } : {}),
      });
      warnings.push(
        'Captura parcial: se reconoció un mercado de jugador. Falta el boleto completo para identificar evento, casa, cuota y monto.',
      );
      if (promotion) warnings.push('Selección 1: confirma la promoción detectada en el icono.');
    }
  }
  if (cashoutOffer !== undefined)
    warnings.push('Cashout visible: se trata como oferta. No se registra como dinero cobrado.');
  if (
    stake !== undefined &&
    odds !== undefined &&
    potential !== undefined &&
    Math.abs(Math.round(stake * odds) - potential) > 0
  )
    warnings.push(
      'El retorno visible difiere de stake × cuota. Se conserva el importe original; puede incluir un boost.',
    );
  if (!selections.length)
    warnings.push(
      'No se reconocieron eventos con suficiente estructura. Completa las selecciones manualmente.',
    );
  const kind =
    headerInfo?.kind ??
    (/combinada|multiple|múltiple|acumulador/i.test(text)
      ? 'Combinada'
      : /bet builder|crear apuesta/i.test(header || lines.slice(0, 3).join(' '))
        ? 'Combinada'
        : /simple|single/i.test(text)
          ? 'Simple'
          : undefined);
  const visibleStatus =
    lines.find((l) =>
      /^(ganada|perdida|anulada|pendiente|won|lost|cash\s*out (?:ejecutado|realizado|cobrado))$/i.test(
        l,
      ),
    ) ?? (house === 'Betano' && header ? settledTicketHeader(header) : undefined);
  if (visibleStatus)
    warnings.push(
      `Estado visible: ${visibleStatus}. Revisa la liquidación y el importe realizado antes de confirmar.`,
    );
  const expectedSelections =
    headerInfo?.expectedSelections ?? text.match(/combinada\s+de\s+(\d+)/i)?.[1];
  if (expectedSelections && selections.length !== Number(expectedSelections))
    warnings.push(
      `El boleto indica ${expectedSelections} selecciones; se reconocieron ${selections.length}. Revisa las faltantes antes de guardar.`,
    );
  if (layout) warnings.push(...layout.warnings);
  if (bonusAmount !== undefined)
    warnings.push(
      'Bono visible: se conserva aparte del retorno. No se suma ni se contabiliza como ganancia realizada.',
    );
  const interpretations = interpretSelections(selections);
  return {
    house,
    ...(house === 'Betano' && visualModeSchema.safeParse(visualMode).success ? { visualMode } : {}),
    kind,
    stake,
    odds,
    potential,
    cashoutOffer,
    bonusAmount,
    visibleStatus,
    placement: classifyPlacement(text, cashoutOffer !== undefined),
    expectedSelections: expectedSelections
      ? Number(expectedSelections)
      : kind === 'Simple'
        ? 1
        : undefined,
    selections,
    warnings,
    reviewReasons: [...(layout?.reviewReasons ?? []), ...semanticReviewReasons(interpretations)],
    interpretations,
    text,
    confidence: {
      house: house ? 'high' : 'missing',
      kind: kind ? 'review' : 'missing',
      stake: stake !== undefined ? 'review' : 'missing',
      odds: odds !== undefined ? 'review' : 'missing',
      potential: potential !== undefined ? 'review' : 'missing',
      ...layout?.fieldConfidence,
    },
  };
}
