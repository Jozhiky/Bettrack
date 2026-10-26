import { z } from 'zod';
import { betSchema, settlementSchema, historicalTimingSchema, toCents } from '../domain/model';
import { settledTicketHeader, betanoHeader } from './header';
import type { ParsedTicket } from './parser';
import { matchesSelectionProduct } from '../domain/odds';
import { agreedFooter } from './receiptOcr';
import { verifiedSelectionResults, visualFullLoss } from './selectionResults';

export const historicalImportSchema = z
  .object({
    kind: settlementSchema.shape.kind,
    betDate: betSchema.shape.date,
    settlementDate: settlementSchema.shape.date,
    closedStake: settlementSchema.shape.closedStake,
    returned: settlementSchema.shape.returned,
    fullClosureConfirmed: z.literal(true),
    executionConfirmed: z.literal(true).optional(),
    automatic: z.literal(true).optional(),
    timing: historicalTimingSchema.optional(),
    header: z.object({
      house: z.enum(['Betano', 'Bet365']),
      kind: betSchema.shape.kind,
      stake: betSchema.shape.stake,
      odds: betSchema.shape.odds,
      potential: betSchema.shape.potential,
      oddsSource: betSchema.shape.oddsSource,
      oddsCalculation: betSchema.shape.oddsCalculation,
    }),
  })
  .strict();
export type HistoricalImport = z.infer<typeof historicalImportSchema>;
type Draft = Pick<ParsedTicket, 'text' | 'house' | 'stake' | 'odds' | 'receiptOcr'> &
  Partial<Pick<ParsedTicket, 'kind' | 'potential' | 'selections' | 'selectionResults'>>;
const money = '(?:S\\s*\\/|PEN)\\s*([0-9]+(?:[.,][0-9]+)*)';
// Whole affirmative execution receipts only. Buttons, instructions and conditions do not match.
const execution = new RegExp(
  `^cash\\s*out\\s+(?:realizado|cobrado|ejecutado|completado)(?:\\s+(?:total|totalmente))?(?:\\s*[:·-]?\\s*${money})?[.!]?$`,
  'i',
);
function amount(value: string) {
  try {
    return toCents(value);
  } catch {
    return undefined;
  }
}
function labeledDate(lines: string[], label: string) {
  const values = lines
    .filter((l) => new RegExp(`^fecha (?:de )?${label}\\s*:`, 'i').test(l))
    .map((l) => l.replace(/^[^:]+:\s*/, ''));
  // Require unambiguous calendar-valid instants with timezone, never normalize February 31.
  if (!values.length || values.some((v) => !z.iso.datetime({ offset: true }).safeParse(v).success))
    return undefined;
  const distinct = [...new Set(values.map((v) => new Date(v).toISOString()))];
  return distinct.length === 1 ? distinct[0] : undefined;
}
export function settlementEvidence(draft: Draft) {
  const lines = draft.text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kinds = new Set<HistoricalImport['kind']>();
  const evidence: string[] = [];
  let manualState = false;
  let headerCashout = false;
  if (visualFullLoss(draft)) {
    kinds.add('Perdida');
    evidence.push('Cruz roja de selección y retorno potencial cero en boleto ordinario Betano.');
  }
  if (draft.house === 'Betano') {
    for (const line of lines) {
      if (
        betanoHeader(line) &&
        /^(?:simple|doble|triple|combinada(?:\s+de\s+\d+)?|bet builder)\s+[S$5]\s*\/\s*\d+[.,]\d{2}\s+cash\s*out$/i.test(
          line,
        )
      ) {
        kinds.add('Cashout');
        evidence.push(line);
        headerCashout = true;
      }
      const status = settledTicketHeader(line);
      if (status) {
        kinds.add(status);
        evidence.push(line);
      }
    }
    // A separate global badge is accepted only beside the top ticket header.
    const top = lines.slice(0, 4);
    if (top.some((l) => betanoHeader(l)))
      for (const line of top)
        if (/^(Ganada|Perdida)$/i.test(line)) {
          kinds.add(/^ganada$/i.test(line) ? 'Ganada' : 'Perdida');
          evidence.push(line);
        }
    if (!kinds.size && top.some((l) => betanoHeader(l))) {
      // A badge farther down may belong to a leg. Never preselect a global result.
      for (const line of lines.slice(4))
        if (/^(Ganada|Perdida)$/i.test(line)) {
          kinds.add(/^ganada$/i.test(line) ? 'Ganada' : 'Perdida');
          evidence.push(line);
          manualState = true;
        }
    }
  }
  const receipts = lines.filter((l) => execution.test(l));
  if (['Betano', 'Bet365'].includes(draft.house ?? '') && receipts.length) {
    kinds.add('Cashout');
    evidence.push(...receipts);
  }
  const partial =
    /\bparcial(?:mente)?\b/i.test(draft.text) && /cash\s*out|cierre|stake/i.test(draft.text);
  const amounts: number[] = [];
  for (const line of lines) {
    const match = line.match(
      new RegExp(
        `^(?:importe (?:cobrado|devuelto|recibido)|retorno (?:real|realizado)|pago (?:final|realizado)|ganancias (?:pagadas|cobradas))\\s*:?\\s*${money}[.!]?$`,
        'i',
      ),
    );
    const receipt = execution.exec(line);
    const value = match?.[1] ?? receipt?.[1];
    if (value !== undefined) {
      const cents = amount(value);
      if (cents !== undefined) amounts.push(cents);
    }
  }
  const distinct = [...new Set(amounts)];
  const suggestions = lines.flatMap((line) => {
    const match = line.match(/^ganancias\s*(?:[S$5]\s*\/|PEN)?\s*([0-9]+(?:[.,][0-9]+)*)[.!]?$/i);
    const value = match && amount(match[1]);
    return typeof value === 'number' ? [value] : [];
  });
  const single = kinds.size === 1 && !manualState ? [...kinds][0] : undefined;
  const closed = lines
    .map((l) => l.match(new RegExp(`^stake cerrado\\s*:?\\s*${money}$`, 'i')))
    .flatMap((m) => (m?.[1] && amount(m[1]) !== undefined ? [amount(m[1])!] : []));
  const closedStakes = [...new Set(closed)];
  const closedStake = closedStakes.length === 1 ? closedStakes[0] : undefined;
  // Betano's settled receipt pairs a terminal GLOBAL header with its stake and
  // paid Ganancias footer. A cashout button or potential return cannot qualify.
  const footerStake = lines.flatMap((line) => {
    const m = line.match(/^apuesta\s*(?:[S$5]\s*\/|PEN)\s*([0-9]+(?:[.,][0-9]+)*)$/i);
    const n = m && amount(m[1]);
    return typeof n === 'number' ? [n] : [];
  });
  const terminal =
    !!single &&
    lines
      .slice(0, 4)
      .some(
        (line) =>
          settledTicketHeader(line) === single ||
          (single === 'Cashout' && headerCashout && betanoHeader(line)),
      );
  const footer = agreedFooter(draft.receiptOcr);
  // A new crop can recover punctuation, not invent a digit, state or stake.
  // Require the original labelled row's complete digit sequence to agree too.
  const unreadPaid = lines.filter((l) => /^ganancias\s+(?:[S$5]\s*\/|PEN)/i.test(l));
  const sourceAmount = unreadPaid[0]?.replace(/^ganancias\s+(?:[S$5]\s*\/|PEN)/i, '').trim();
  const sourceDigits =
    sourceAmount && /^[0-9][0-9.,\s¿?]*$/.test(sourceAmount)
      ? sourceAmount.replace(/\D/g, '')
      : undefined;
  const readDigits = draft.receiptOcr?.text
    .match(/ganancias\s+(?:[S$5]\s*\/|PEN)\s*(\d+[.,]\d{2})/i)?.[1]
    .replace(/\D/g, '');
  if (
    !suggestions.length &&
    unreadPaid.length === 1 &&
    footer &&
    footer.stake === draft.stake &&
    sourceDigits === readDigits
  )
    suggestions.push(footer.returned);
  const receiptPaid =
    draft.house === 'Betano' &&
    terminal &&
    !manualState &&
    footerStake.length === 1 &&
    footerStake[0] === draft.stake &&
    suggestions.length === 1 &&
    !partial &&
    !/^(?:cash\s*out|cerrar apuesta)\s*(?:[S$5]\s*\/|PEN)\s*\d/im.test(draft.text) &&
    !/ganancias\s+(?:potenciales|posibles)|retorno\s+potencial/i.test(draft.text) &&
    !distinct.some((n) => n !== suggestions[0]);
  const ambiguousStake =
    closedStakes.length > 1 ||
    (closedStake !== undefined && draft.stake !== undefined && closedStake !== draft.stake);
  return {
    kinds: [...kinds],
    kind: single,
    evidence,
    candidate:
      kinds.size > 0 ||
      partial ||
      ambiguousStake ||
      !!verifiedSelectionResults(draft)?.marks.some((m) => m.status === 'lost'),
    manualState,
    executionNeedsConfirmation: headerCashout && receipts.length === 0,
    receiptPaid,
    receiptReturn: receiptPaid ? suggestions[0] : undefined,
    suggestedReturn:
      kinds.size === 1 && new Set(suggestions).size === 1 ? suggestions[0] : undefined,
    partial: partial || ambiguousStake,
    closedStake,
    returned:
      single === 'Perdida' && ![...distinct, ...suggestions].some((n) => n !== 0)
        ? 0
        : distinct.length === 1
          ? distinct[0]
          : undefined,
    conflictingAmounts:
      distinct.length > 1 ||
      (single === 'Perdida' && [...distinct, ...suggestions].some((n) => n !== 0)),
    betDate: labeledDate(lines, 'apuesta'),
    settlementDate: labeledDate(lines, '(?:liquidación|liquidacion|cierre)'),
  };
}
export function needsReceiptRead(draft: Draft) {
  const e = settlementEvidence(draft);
  return (
    draft.house === 'Betano' &&
    !draft.receiptOcr &&
    (e.kind === 'Ganada' || e.kind === 'Cashout') &&
    !e.manualState &&
    !e.partial &&
    !e.conflictingAmounts &&
    e.returned === undefined &&
    e.receiptReturn === undefined &&
    !/ganancias\s+(?:potenciales|posibles)|retorno\s+potencial|^(?:cash\s*out|cerrar apuesta)\s*(?:[S$5]\s*\/|PEN)\s*\d/im.test(
      draft.text,
    )
  );
}
export function validateHistoricalImport(
  raw: unknown,
  draft: Draft,
  rows: readonly { odds?: number | null }[] = [],
): HistoricalImport {
  const data = historicalImportSchema.parse(raw),
    evidence = settlementEvidence(draft);
  if (
    data.automatic &&
    (data.timing === undefined ||
      !evidence.kind ||
      evidence.manualState ||
      (data.kind !== 'Perdida' && data.returned !== (evidence.returned ?? evidence.receiptReturn)))
  )
    throw Error('La preparación automática requiere estado y cobro acreditados por el boleto.');
  if (
    data.timing &&
    (!data.automatic ||
      data.betDate !== data.timing.recordedAt ||
      data.settlementDate !== data.timing.recordedAt ||
      [data.timing.betAt, data.timing.settledAt].some(
        (at) => at && Date.parse(at) > Date.parse(data.betDate),
      ) ||
      (data.timing.betAt &&
        data.timing.settledAt &&
        Date.parse(data.timing.betAt) > Date.parse(data.timing.settledAt)))
  )
    throw Error('La fecha contable debe conservar la cronología original por separado.');
  if (
    data.header.oddsSource === 'selection-product' &&
    (draft.odds !== undefined ||
      data.header.kind !== 'Combinada' ||
      !matchesSelectionProduct(data.header.odds, data.header.oddsCalculation, rows))
  )
    throw Error(
      'Revisa la cuota calculada con todas las selecciones; conserva el total visible si existe.',
    );
  if (!evidence.kinds.includes(data.kind))
    throw Error(
      'El estado final no tiene evidencia global suficiente. Una oferta cashout no acredita ejecución.',
    );
  if (
    data.kind === 'Cashout' &&
    evidence.executionNeedsConfirmation &&
    !(data.automatic && evidence.receiptPaid) &&
    !data.executionConfirmed
  )
    throw Error(
      'Confirma que el Cash Out de la cabecera fue ejecutado y cobrado; una oferta no basta.',
    );
  if (
    evidence.partial ||
    (evidence.closedStake !== undefined && evidence.closedStake !== data.closedStake)
  )
    throw Error('Cashout parcial o stake cerrado ambiguo: conserva el boleto en revisión.');
  if (evidence.conflictingAmounts)
    throw Error('Los importes realizados son contradictorios. Añade un comprobante inequívoco.');
  if (data.closedStake !== data.header.stake)
    throw Error('El cierre debe corresponder al stake completo.');
  if (data.kind === 'Perdida' && data.returned !== 0)
    throw Error('Una pérdida total devuelve cero.');
  if (data.kind === 'Ganada' && data.returned <= data.header.stake)
    throw Error('Una Ganada requiere retorno mayor que el stake. Revisa estado e importe.');
  if (Date.parse(data.settlementDate) < Date.parse(data.betDate))
    throw Error('La liquidación no puede preceder a la apuesta.');
  if (Date.parse(data.settlementDate) > Date.now())
    throw Error('La liquidación histórica no puede estar en el futuro.');
  return {
    ...data,
    betDate: new Date(data.betDate).toISOString(),
    settlementDate: new Date(data.settlementDate).toISOString(),
  };
}
