import { z } from 'zod';
import { betSchema, settlementSchema, toCents } from '../domain/model';
import { settledTicketHeader, betanoHeader } from './header';
import type { ParsedTicket } from './parser';

export const historicalImportSchema = z
  .object({
    kind: settlementSchema.shape.kind,
    betDate: betSchema.shape.date,
    settlementDate: settlementSchema.shape.date,
    closedStake: settlementSchema.shape.closedStake,
    returned: settlementSchema.shape.returned,
    fullClosureConfirmed: z.literal(true),
    header: z.object({
      house: z.enum(['Betano', 'Bet365']),
      kind: betSchema.shape.kind,
      stake: betSchema.shape.stake,
      odds: betSchema.shape.odds,
      potential: betSchema.shape.potential,
    }),
  })
  .strict();
export type HistoricalImport = z.infer<typeof historicalImportSchema>;
type Draft = Pick<ParsedTicket, 'text' | 'house' | 'stake'>;
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
  if (draft.house === 'Betano') {
    for (const line of lines) {
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
  const single = kinds.size === 1 && !manualState ? [...kinds][0] : undefined;
  const closed = lines
    .map((l) => l.match(new RegExp(`^stake cerrado\\s*:?\\s*${money}$`, 'i')))
    .flatMap((m) => (m?.[1] && amount(m[1]) !== undefined ? [amount(m[1])!] : []));
  const closedStakes = [...new Set(closed)];
  const closedStake = closedStakes.length === 1 ? closedStakes[0] : undefined;
  const ambiguousStake =
    closedStakes.length > 1 ||
    (closedStake !== undefined && draft.stake !== undefined && closedStake !== draft.stake);
  return {
    kinds: [...kinds],
    kind: single,
    evidence,
    candidate: kinds.size > 0 || partial || ambiguousStake,
    manualState,
    partial: partial || ambiguousStake,
    closedStake,
    returned:
      single === 'Perdida' && !distinct.some((n) => n !== 0)
        ? 0
        : distinct.length === 1
          ? distinct[0]
          : undefined,
    conflictingAmounts:
      distinct.length > 1 || (single === 'Perdida' && distinct.some((n) => n !== 0)),
    betDate: labeledDate(lines, 'apuesta'),
    settlementDate: labeledDate(lines, '(?:liquidación|liquidacion|cierre)'),
  };
}
export function validateHistoricalImport(raw: unknown, draft: Draft): HistoricalImport {
  const data = historicalImportSchema.parse(raw),
    evidence = settlementEvidence(draft);
  if (!evidence.kinds.includes(data.kind))
    throw Error(
      'El estado final no tiene evidencia global suficiente. Una oferta cashout no acredita ejecución.',
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
