import { z } from 'zod';
import { matchesSelectionProduct } from './odds';
export const id = () => crypto.randomUUID();
export const timestamp = () => new Date().toISOString();
const cents = z.number().int().safe().min(0).max(1_000_000_000_00);
export const currencies = ['PEN', 'USD', 'EUR'] as const;
export const kinds = ['Simple', 'Combinada'] as const;
export const states = ['Pendiente', 'Ganada', 'Perdida', 'Cashout'] as const;
export type State = (typeof states)[number];
export const masterSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  currency: z.enum(currencies).default('PEN'),
  platform: z.string().max(100).default(''),
  channel: z.string().max(150).default(''),
  url: z.union([z.literal(''), z.url()]).default(''),
  notes: z.string().max(2000).default(''),
});
export type Master = z.infer<typeof masterSchema>;
export const promotions = ['', 'Suplente de Oro', 'Pago anticipado +2'] as const;
export const bonusTreatments = ['Sin confirmar', 'Adicional', 'Incluido'] as const;
export const selectionSchema = z.object({
  id: z.string(),
  betId: z.string(),
  order: z.number().int().nonnegative().optional(),
  event: z.string().trim().min(1).max(250),
  sport: z.string().max(80),
  league: z.string().max(150),
  market: z.string().trim().min(1).max(250),
  pick: z.string().trim().min(1).max(250),
  odds: z.number().min(1).max(100000).nullable(),
  promotion: z.enum(promotions).optional(),
  builderMarkets: z
    .array(
      z.object({
        market: z.string().trim().min(1).max(250),
        pick: z.string().trim().min(1).max(250),
        promotion: z.enum(promotions).optional(),
      }),
    )
    .max(100)
    .optional(),
});
export type Selection = z.infer<typeof selectionSchema>;
// A booking instant is not evidence of the historical placement or settlement instant.
export const historicalTimingSchema = z.object({
  recordedAt: z.iso.datetime(),
  uploadedAt: z.iso.datetime(),
  betAt: z.iso.datetime().nullable(),
  settledAt: z.iso.datetime().nullable(),
  mode: z.enum(['prematch', 'live', 'unknown']),
  events: z
    .array(
      z.object({
        selection: z.number().int().min(0).max(99).nullable(),
        label: z.string().max(200),
        at: z.iso.datetime().nullable(),
        relative: z.boolean(),
        basis: z.enum(['ticket-calendar', 'upload-reference']),
      }),
    )
    .max(100),
});
export const betSchema = z
  .object({
    id: z.string().min(1),
    date: z.iso.datetime(),
    dateSource: z.enum(['manual', 'ticket', 'upload', 'accounting']).optional(),
    historicalTiming: historicalTimingSchema.optional(),
    timingUnknown: z.boolean().optional(),
    houseId: z.string().min(1),
    streamerId: z.string(),
    kind: z.enum(kinds),
    live: z.boolean(),
    odds: z.number().min(1).max(100000).nullable(),
    stake: cents.positive(),
    potential: cents.nullable(),
    historical: z.literal(true).optional(),
    oddsSource: z.enum(['ticket', 'manual', 'selection-product']).optional(),
    oddsCalculation: z
      .object({
        method: z.literal('product-truncate-2'),
        inputs: z.array(z.number().min(1).max(100000)).min(2).max(100),
      })
      .optional(),
    bonus: z.object({ amount: cents, treatment: z.enum(bonusTreatments) }).optional(),
    notes: z.string().max(10000),
    source: z.enum(['manual', 'ocr', 'import']),
    imageId: z.string().optional(),
    fingerprint: z.string(),
    ticketReference: z.string().min(6).max(100).optional(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((b, ctx) => {
    if (
      b.dateSource === 'accounting' &&
      (!b.historical ||
        !b.historicalTiming ||
        b.date !== b.historicalTiming.recordedAt ||
        !['ocr', 'import'].includes(b.source))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'El registro contable requiere procedencia y fechas históricas separadas.',
      });
    if (b.historicalTiming && b.dateSource !== 'accounting')
      ctx.addIssue({
        code: 'custom',
        message: 'La cronología separada requiere una fecha de registro contable.',
      });
    if (b.historicalTiming) {
      const t = b.historicalTiming;
      if (
        t.uploadedAt !== b.createdAt ||
        Date.parse(t.uploadedAt) > Date.parse(t.recordedAt) ||
        [t.betAt, t.settledAt].some((at) => at && Date.parse(at) > Date.parse(t.recordedAt)) ||
        (t.betAt && t.settledAt && Date.parse(t.betAt) > Date.parse(t.settledAt)) ||
        b.live !== (t.mode === 'live') ||
        b.timingUnknown !== (t.mode === 'unknown')
      )
        ctx.addIssue({
          code: 'custom',
          message: 'La cronología y la procedencia del boleto son contradictorias.',
        });
    }
    if (
      b.oddsSource === 'selection-product' &&
      (b.kind !== 'Combinada' ||
        !matchesSelectionProduct(
          b.odds,
          b.oddsCalculation,
          b.oddsCalculation?.inputs.map((odds) => ({ odds })) ?? [],
        ))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'La cuota calculada no coincide con su producto y truncamiento registrados.',
      });
    if (b.oddsCalculation && b.oddsSource !== 'selection-product')
      ctx.addIssue({
        code: 'custom',
        message: 'Una cuota manual o leída no lleva un cálculo atribuido.',
      });
    if (
      (b.odds === null || b.potential === null) &&
      (!b.historical ||
        !['ocr', 'import'].includes(b.source) ||
        (!['manual', 'ticket'].includes(b.dateSource ?? '') && b.dateSource !== 'accounting') ||
        (b.dateSource !== 'accounting' && b.timingUnknown !== false))
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Cuota y potencial desconocidos solo se conservan en importaciones históricas liquidadas.',
      });
  });
export type Bet = z.infer<typeof betSchema>;
// Compatibility at storage boundaries only; new bets use betSchema.
export const storedBetSchema = z.preprocess((value) => {
  if (
    value &&
    typeof value === 'object' &&
    'kind' in value &&
    ['Doble', 'Triple', 'Bet Builder'].includes(String(value.kind))
  )
    return { ...value, kind: 'Combinada' };
  return value;
}, betSchema);
export const selectionCount = (rows: Pick<Selection, 'builderMarkets'>[]) =>
  rows.reduce((sum, row) => sum + Math.max(1, row.builderMarkets?.length ?? 0), 0);
export const uploadSchema = z.object({
  id: z.string().min(1),
  imageId: z.string().min(1),
  createdAt: z.iso.datetime(),
  status: z.enum(['queued', 'processing', 'saved', 'linked', 'review', 'duplicate', 'error']),
  progress: z.number().min(0).max(100),
  draftJson: z.string().max(2000000),
  reason: z.string().max(10000),
  betId: z.string().optional(),
  allowDuplicate: z.boolean().optional(),
  enhanced: z.boolean().optional(),
  leaseUntil: z.iso.datetime().optional(),
});
export type CaptureUpload = z.infer<typeof uploadSchema>;
export const settlementSchema = z.object({
  id: z.string(),
  betId: z.string(),
  date: z.iso.datetime(),
  closedStake: cents.positive(),
  returned: cents,
  kind: z.enum(['Ganada', 'Perdida', 'Cashout']),
  note: z.string().max(2000),
});
export type Settlement = z.infer<typeof settlementSchema>;
// Read old records without changing money or inventing a new result.
export const storedSettlementSchema = settlementSchema.extend({
  kind: z.enum(['Ganada', 'Perdida', 'Cashout', 'Anulada', 'Parcial']),
});
export type StoredSettlement = z.infer<typeof storedSettlementSchema>;
export const movementSchema = z.object({
  id: z.string(),
  houseId: z.string(),
  date: z.iso.datetime(),
  kind: z.enum([
    'Capital inicial',
    'Depósito',
    'Retiro',
    'Apuesta colocada',
    'Apuesta liquidada',
    'Cashout',
    'Reembolso',
    'Ajuste',
    'Transferencia',
  ]),
  amount: z.number().int().safe().min(-1_000_000_000_00).max(1_000_000_000_00),
  note: z.string().max(2000),
  betId: z.string().optional(),
  settlementId: z.string().optional(),
  transferId: z.string().optional(),
});
export type Movement = z.infer<typeof movementSchema>;
export interface Audit {
  id: string;
  date: string;
  action: string;
  entityId: string;
  before: string;
  after: string;
}
export interface StoredImage {
  id: string;
  hash: string;
  blob: Blob;
  name: string;
  originalHash?: string;
  bytes?: number;
  originalBytes?: number;
  width?: number;
  height?: number;
}
export interface Settings {
  id: 'settings';
  theme: 'light' | 'dark';
  currency: (typeof currencies)[number];
  exposureLimit: number;
  lossLimit: number;
  automaticCaptures?: import('./automaticPolicy').AutomaticPolicy;
}
export interface Snapshot {
  houses: Master[];
  streamers: Master[];
  bets: Bet[];
  selections: Selection[];
  settlements: StoredSettlement[];
  movements: Movement[];
  audit: Audit[];
}
export const emptySnapshot: Snapshot = {
  houses: [],
  streamers: [],
  bets: [],
  selections: [],
  settlements: [],
  movements: [],
  audit: [],
};
export const defaultSettings: Settings = {
  id: 'settings',
  theme: 'light',
  currency: 'PEN',
  exposureLimit: 50000,
  lossLimit: 20000,
};
export function money(value: number, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value === 0 ? 0 : value / 100);
}
function normalizedNumber(value: string): string {
  let s = value.trim().replace(/S\s*\/|PEN|USD|EUR|[$€\s]/gi, '');
  if (s.includes(',') && s.includes('.')) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = s.replace(dec === ',' ? /\./g : /,/g, '').replace(',', '.');
  } else s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('Número inválido');
  return s;
}
export function decimal(value: string): number {
  const s = normalizedNumber(value);
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error('Número inválido');
  return n;
}
export function toCents(value: string) {
  const s = normalizedNumber(value);
  const [whole, fraction = ''] = s.replace('-', '').split('.');
  if (fraction.length > 2)
    throw new Error(
      'Los importes admiten como máximo dos decimales. Revisa separadores y céntimos.',
    );
  const integer = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const n = Number(s.startsWith('-') ? -integer : integer);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 1_000_000_000_00)
    throw new Error('Importe fuera de rango');
  return n;
}
export const limaDay = (date: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
export const displayDate = (date: string) =>
  new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
export const localInput = (date: string) =>
  new Date(new Date(date).getTime() - 5 * 3600000).toISOString().slice(0, 16);
export const fromLocal = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Fecha y hora inválidas.');
  const date = new Date(`${value}:00-05:00`);
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha y hora inválidas.');
  const result = date.toISOString();
  if (localInput(result) !== value) throw new Error('La fecha no existe en el calendario.');
  return result;
};
export function fingerprint(
  b: Pick<Bet, 'houseId' | 'stake' | 'odds' | 'date'>,
  selections: Pick<Selection, 'event' | 'market' | 'pick' | 'builderMarkets' | 'promotion'>[],
) {
  return [
    b.houseId,
    limaDay(b.date),
    b.stake,
    b.odds,
    ...selections
      .map(
        (s) =>
          `${s.event}|${s.market}|${s.pick}${s.promotion ? '|promo:' + s.promotion : ''}${
            s.builderMarkets?.length
              ? '|' +
                s.builderMarkets
                  .map((m) => `${m.market}:${m.pick}${m.promotion ? ':promo:' + m.promotion : ''}`)
                  .sort()
                  .join('|')
              : ''
          }`,
      )
      .sort(),
  ]
    .join('|')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
export function position(b: Bet, settlements: StoredSettlement[]) {
  const items = settlements
    .filter((s) => s.betId === b.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const closed = items.reduce((a, s) => a + s.closedStake, 0);
  const returned = items.reduce((a, s) => a + s.returned, 0);
  const remaining = b.stake - closed;
  const last = items[0];
  const needsReview =
    items.length > 1 ||
    (!!last &&
      (last.closedStake !== b.stake || !settlementSchema.shape.kind.safeParse(last.kind).success));
  const status: State = !last || needsReview ? 'Pendiente' : (last.kind as Settlement['kind']);
  return { closed, returned, remaining, profit: returned - closed, status, needsReview };
}
export function totals(data: Snapshot, currency = 'PEN') {
  const houseIds = new Set(data.houses.filter((h) => h.currency === currency).map((h) => h.id));
  const movements = data.movements.filter((m) => houseIds.has(m.houseId));
  const bets = data.bets.filter((b) => houseIds.has(b.houseId));
  const ps = bets.map((b) => position(b, data.settlements));
  const sumKind = (kind: Movement['kind']) =>
    movements.filter((m) => m.kind === kind).reduce((a, m) => a + m.amount, 0);
  const profit = ps.reduce((a, p) => a + p.profit, 0),
    closed = ps.reduce((a, p) => a + p.closed, 0),
    available = movements.reduce((a, m) => a + m.amount, 0),
    committed = ps.reduce((a, p) => a + p.remaining, 0),
    initial = sumKind('Capital inicial'),
    deposits = sumKind('Depósito'),
    withdrawals = -sumKind('Retiro');
  return {
    initial,
    deposits,
    withdrawals,
    available,
    committed,
    bank: available + committed,
    profit,
    closed,
    yield: closed ? (profit / closed) * 100 : 0,
    roi: initial + deposits ? (profit / (initial + deposits)) * 100 : 0,
    gains: ps.reduce((a, p) => a + Math.max(0, p.profit), 0),
    losses: ps.reduce((a, p) => a + Math.min(0, p.profit), 0),
    average: bets.some((b) => b.odds !== null)
      ? bets.reduce((a, b) => a + (b.odds ?? 0), 0) / bets.filter((b) => b.odds !== null).length
      : null,
    pending: ps.filter((p) => p.status === 'Pendiente').length,
    won: ps.filter((p) => p.status === 'Ganada').length,
    lost: ps.filter((p) => p.status === 'Perdida').length,
    cashouts: ps.filter((p) => p.status === 'Cashout').length,
  };
}
