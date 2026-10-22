import { transact } from './cloudStore';
import { canonicalJSON } from './jsonEquality';
import Papa from 'papaparse';
import { z } from 'zod';
import { repo, LocalRepository } from './repository';
import { hashImage } from '../ocr/engine';
import {
  betSchema,
  storedBetSchema,
  storedSettlementSchema,
  selectionCount,
  uploadSchema,
  selectionSchema,
  settlementSchema,
  movementSchema,
  masterSchema,
  position,
  id,
  timestamp,
  toCents,
  decimal,
  fromLocal,
  type Snapshot,
  type Bet,
  type Selection,
  type Settlement,
  type Settings,
} from '../domain/model';
const jsonText = z.string().refine((value) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}, 'JSON de auditoría inválido');
const auditSchema = z.object({
  id: z.string(),
  date: z.iso.datetime(),
  action: z.string(),
  entityId: z.string(),
  before: jsonText,
  after: jsonText,
});
const settingsSchema = z.object({
  id: z.literal('settings'),
  theme: z.enum(['light', 'dark']),
  currency: z.enum(['PEN', 'USD', 'EUR']),
  exposureLimit: z.number().int().nonnegative().safe(),
  lossLimit: z.number().int().nonnegative().safe(),
});
const backupSchema = z.object({
  format: z.literal('bettrack'),
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  data: z.object({
    houses: z.array(masterSchema),
    streamers: z.array(masterSchema),
    bets: z.array(storedBetSchema),
    selections: z.array(selectionSchema),
    settlements: z.array(storedSettlementSchema),
    movements: z.array(movementSchema),
    audit: z.array(auditSchema),
  }),
  settings: settingsSchema,
  uploads: z.array(uploadSchema).default([]),
  images: z.array(
    z.object({
      id: z.string(),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      originalHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      bytes: z.number().int().nonnegative().optional(),
      originalBytes: z.number().int().nonnegative().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      name: z.string(),
      data: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/),
    }),
  ),
});
export type Backup = z.infer<typeof backupSchema>;
export async function createBackup() {
  const d = repo.database;
  return transact(d, 'r', d.tables, async (d) => {
      const data = await new LocalRepository(d).snapshot();
      const settings = await d.settings.get('settings');
      const images = await d.images.toArray();
      const uploads = await d.uploads.toArray();
      return { data, settings, images, uploads };
    })
    .then(async ({ data, settings, images, uploads }) => ({
      format: 'bettrack',
      version: 1,
      createdAt: timestamp(),
      data,
      settings,
      uploads,
      images: await Promise.all(
        images.map(async (im) => ({
          ...im,
          blob: undefined,
          data: await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(im.blob);
          }),
        })),
      ),
    }));
}
export function validateBackup(raw: unknown): Backup {
  const b = backupSchema.parse(raw);
  const d = b.data;
  if (new Set(b.uploads.map((u) => u.id)).size !== b.uploads.length)
    throw new Error('Capturas en cola repetidas.');
  for (const u of b.uploads)
    if (
      !b.images.some((i) => i.id === u.imageId) ||
      (u.betId && !d.bets.some((x) => x.id === u.betId))
    )
      throw new Error('Referencia de captura en cola inválida.');
  if (new Set(b.images.map((i) => i.id)).size !== b.images.length)
    throw new Error('IDs de captura repetidos.');
  for (const table of Object.values(d)) {
    if (new Set(table.map((x) => x.id)).size !== table.length)
      throw new Error('IDs repetidos dentro del respaldo.');
  }
  const houses = new Map(d.houses.map((x) => [x.id, x]));
  const bets = new Map(d.bets.map((x) => [x.id, x]));
  for (const bet of d.bets) {
    if (
      !houses.has(bet.houseId) ||
      (bet.streamerId && !d.streamers.some((s) => s.id === bet.streamerId))
    )
      throw new Error('Referencia de apuesta inválida.');
    const sels = d.selections.filter((s) => s.betId === bet.id);
    if (!sels.length) throw new Error('Apuesta sin selecciones.');
    const count = selectionCount(sels);
    if ((bet.kind === 'Simple' && sels.length !== 1) || (bet.kind === 'Combinada' && count < 2))
      throw new Error('Tipo y número de selecciones inconsistentes.');
    const p = position(bet, d.settlements);
    if (p.remaining < 0) throw new Error('Stake liquidado más de una vez.');
    const moves = d.movements.filter((m) => m.betId === bet.id && m.kind === 'Apuesta colocada');
    if (
      moves.length !== 1 ||
      moves[0].amount !== -bet.stake ||
      moves[0].houseId !== bet.houseId ||
      moves[0].date !== bet.date
    )
      throw new Error('Libro de stakes inconsistente.');
    if (bet.imageId && !b.images.some((i) => i.id === bet.imageId))
      throw new Error('Falta una captura referenciada.');
  }
  for (const s of d.selections) if (!bets.has(s.betId)) throw new Error('Selección huérfana.');
  for (const s of d.settlements) {
    const bet = bets.get(s.betId);
    if (
      !bet ||
      s.date < bet.date ||
      (s.kind === 'Anulada' && s.returned !== s.closedStake) ||
      (s.kind === 'Perdida' && s.returned !== 0)
    )
      throw new Error('Liquidación inválida.');
    const moves = d.movements.filter((m) => m.settlementId === s.id);
    if (
      moves.length !== 1 ||
      moves[0].amount !== s.returned ||
      moves[0].betId !== s.betId ||
      moves[0].houseId !== bet.houseId ||
      moves[0].date !== s.date ||
      moves[0].kind !==
        (s.kind === 'Cashout'
          ? 'Cashout'
          : s.kind === 'Anulada'
            ? 'Reembolso'
            : 'Apuesta liquidada')
    )
      throw new Error('Libro de liquidaciones inconsistente.');
  }
  for (const m of d.movements) {
    if (
      (['Capital inicial', 'Depósito'].includes(m.kind) && m.amount <= 0) ||
      (m.kind === 'Retiro' && m.amount >= 0) ||
      (m.kind === 'Ajuste' && (!m.note.trim() || m.amount === 0))
    )
      throw new Error('Signo o motivo de movimiento inválido.');
    if (
      !['Apuesta colocada', 'Apuesta liquidada', 'Cashout', 'Reembolso'].includes(m.kind) &&
      (m.betId || m.settlementId)
    )
      throw new Error('Referencia financiera no permitida.');
    if (m.kind !== 'Transferencia' && m.transferId)
      throw new Error('Referencia de transferencia no permitida.');
    if (
      !houses.has(m.houseId) ||
      (m.betId && !bets.has(m.betId)) ||
      (m.settlementId && !d.settlements.some((s) => s.id === m.settlementId))
    )
      throw new Error('Movimiento huérfano.');
    if (
      ['Apuesta colocada', 'Apuesta liquidada', 'Cashout', 'Reembolso'].includes(m.kind) &&
      !m.betId
    )
      throw new Error('Movimiento sin apuesta.');
    if (['Apuesta liquidada', 'Cashout', 'Reembolso'].includes(m.kind) && !m.settlementId)
      throw new Error('Movimiento sin liquidación.');
    if (m.kind === 'Transferencia') {
      const pair = d.movements.filter((x) => x.transferId === m.transferId);
      if (
        !m.transferId ||
        pair.length !== 2 ||
        pair.some((x) => x.kind !== 'Transferencia' || x.amount === 0) ||
        pair[0].amount + pair[1].amount !== 0 ||
        pair[0].houseId === pair[1].houseId ||
        houses.get(pair[0].houseId)?.currency !== houses.get(pair[1].houseId)?.currency
      )
        throw new Error('Transferencia inválida.');
    }
  }
  for (const h of d.houses)
    if (d.movements.filter((m) => m.houseId === h.id && m.kind === 'Capital inicial').length > 1)
      throw new Error('Capital inicial duplicado.');
  return b;
}
export async function restoreBackup(backup: Backup) {
  const valid = validateBackup(backup);
  const d = repo.database;
  const images = await Promise.all(
    valid.images.map(async (i) => {
      const blob = await (await fetch(i.data)).blob();
      if (blob.size > 15 * 1024 * 1024 || (await hashImage(blob)) !== i.hash)
        throw new Error('Captura dañada o hash incorrecto.');
        return { id: i.id, name: i.name, hash: i.hash, blob, originalHash: i.originalHash, bytes: blob.size, originalBytes: i.originalBytes, width: i.width, height: i.height };
    }),
  );
  await transact(d,'rw', d.tables, async (d) => {
    for (const tableName of [
      'houses',
      'streamers',
      'bets',
      'selections',
      'settlements',
      'movements',
      'audit',
    ] as const) {
      for (const row of valid.data[tableName]) {
        const table = d.table(tableName);
        const existing = await table.get(row.id);
        if (existing && canonicalJSON(existing) !== canonicalJSON(row))
          throw new Error(`Conflicto en ${tableName}. No se reemplazó ningún dato.`);
        if (!existing) await table.add(row);
      }
    }
    for (const im of images) {
      const old = await d.images.get(im.id);
      if (old && old.hash !== im.hash) throw new Error('Conflicto de captura.');
      if (!old) await d.images.add(im);
    }
    for (const upload of valid.uploads) {
      const old = await d.uploads.get(upload.id);
      if (old && old.imageId !== upload.imageId) throw new Error('Conflicto de captura en cola.');
      if (!old)
        await d.uploads.add(
          ['queued', 'processing'].includes(upload.status)
            ? {
                ...upload,
                status: 'review',
                reason: 'Captura restaurada. Pulsa Reintentar lectura para continuar.',
              }
            : upload,
        );
    }
    await d.settings.put(valid.settings as Settings);
    await d.audit.add({
      id: id(),
      date: timestamp(),
      action: 'Restaurar respaldo (fusión)',
      entityId: 'backup',
      before: 'null',
      after: JSON.stringify({ bets: valid.data.bets.length }),
    });
  });
}
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(data: Snapshot) {
  return Papa.unparse(
    data.bets.map((b) => {
      const p = position(b, data.settlements);
      return {
        Fecha: b.date,
        'Origen de fecha': b.dateSource || '',
        Casa: data.houses.find((h) => h.id === b.houseId)?.name,
        Moneda: data.houses.find((h) => h.id === b.houseId)?.currency,
        Apuesta: data.selections
          .filter((s) => s.betId === b.id)
          .map((s) => s.event)
          .join(' / '),
        'Monto apostado': (b.stake / 100).toFixed(2),
        Cuota: b.odds,
        'Retorno potencial': (b.potential / 100).toFixed(2),
        'Bono potencial': b.bonus ? (b.bonus.amount / 100).toFixed(2) : '',
        'Tratamiento del bono': b.bonus?.treatment || '',
        'Monto cashout': p.status === 'Cashout' ? (p.returned / 100).toFixed(2) : '',
        Estado: p.status,
        Resultado: (p.profit / 100).toFixed(2),
        Tipo: b.kind,
        'En vivo': b.timingUnknown ? 'Sin determinar' : b.live ? 'Sí' : 'No',
        Observaciones: b.notes,
        'Selecciones JSON': JSON.stringify(data.selections.filter((s) => s.betId === b.id)),
        'Liquidaciones JSON': JSON.stringify(data.settlements.filter((s) => s.betId === b.id)),
      };
    }),
    { escapeFormulae: true },
  );
}
export interface ImportDraft {
  bet: Partial<Bet>;
  selections: Partial<Selection>[];
  settlements: Partial<Settlement>[];
  warnings: string[];
  house?: string;
  currency?: string;
  status?: string;
}
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export function parseCSV(text: string): ImportDraft[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalize,
  });
  if (parsed.errors.length) throw new Error('CSV inválido: ' + parsed.errors[0].message);
  return parsed.data.map((row) => {
    const get = (...keys: string[]) => keys.map((k) => row[k]).find(Boolean) || '';
    const warnings: string[] = [];
    const num = (v: string, cents = false) => {
      if (!v) return undefined;
      try {
        return cents ? toCents(v) : decimal(v);
      } catch {
        warnings.push(`Número no reconocido: ${v}`);
        return undefined;
      }
    };
    let date: string | undefined;
    const rawDate = get('fecha', 'fecha y hora');
    try {
      if (/^\d{4}-\d{2}-\d{2}T.*Z$/.test(rawDate)) date = new Date(rawDate).toISOString();
      else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) date = fromLocal(rawDate + 'T12:00');
      else {
        const m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?$/);
        if (m) date = fromLocal(`${m[3]}-${m[2]}-${m[1]}T${m[4] || '12:00'}`);
      }
    } catch {
      /* review */
    }
    if (!date) warnings.push('Fecha ausente o no reconocida: debes confirmarla.');
    const stake = num(get('monto apostado', 'stake', 'monto'), true);
    const odds = num(get('cuota', 'odds'));
    const status = get('estado');
    const cashout = num(get('monto cashout', 'cashout'), true);
    const result = num(get('resultado'), true);
    const bonusAmount = num(get('bono potencial'), true);
    let bonus: Bet['bonus'];
    if (bonusAmount !== undefined) {
      const checked = betSchema.shape.bonus.safeParse({
        amount: bonusAmount,
        treatment: get('tratamiento del bono') || 'Sin confirmar',
      });
      if (checked.success) bonus = checked.data;
      else warnings.push('Bono ambiguo o inválido: revisa su importe y tratamiento.');
    }
    let selections: Partial<Selection>[] = [
      { event: get('apuesta', 'evento'), market: get('mercado'), pick: get('seleccion') },
    ];
    let settlements: Partial<Settlement>[] = [];
    if (get('selecciones json')) {
      try {
        selections = z.array(selectionSchema).parse(JSON.parse(get('selecciones json')));
      } catch {
        warnings.push('Selecciones JSON inválidas.');
      }
    }
    if (get('liquidaciones json')) {
      try {
        const rows = z.array(settlementSchema).parse(JSON.parse(get('liquidaciones json')));
        if (
          rows.length > 1 ||
          rows.some((s) => s.closedStake !== stake || (s.kind === 'Perdida' && s.returned !== 0))
        )
          throw new Error('Se requiere un único resultado por el monto completo.');
        settlements = rows;
      } catch {
        warnings.push(
          'Resultado no compatible: se requiere Ganada, Perdida o Cashout por el monto completo. Revisa el registro original.',
        );
      }
    } else if (stake) {
      const s = normalize(status);
      if (s === 'cashout' && cashout !== undefined)
        settlements = [
          {
            kind: 'Cashout',
            closedStake: stake,
            returned: cashout,
            date,
            note: 'Cashout ejecutado importado; confirmado por usuario',
          },
        ];
      else if (s === 'perdida')
        settlements = [
          { kind: 'Perdida', closedStake: stake, returned: 0, date, note: 'Importación' },
        ];
      else if (s === 'ganada' && result !== undefined && stake + result >= 0)
        settlements = [
          {
            kind: 'Ganada',
            closedStake: stake,
            returned: stake + result,
            date,
            note: 'Importación',
          },
        ];
      else if (s && s !== 'pendiente')
        warnings.push(`Estado ${status}: importe liquidado ambiguo; confirma manualmente.`);
    }
    if (cashout !== undefined && normalize(status) !== 'cashout')
      warnings.push('Cashout visible sin estado ejecutado: no se importará como cobrado.');
    if (status && normalize(status) !== 'pendiente' && !settlements.length)
      warnings.push(
        'No hay una liquidación verificable. Esta fila se guardará pendiente; registra el resultado desde su detalle.',
      );
    return {
      bet: {
        date,
        dateSource: ['manual', 'ticket', 'upload'].includes(get('origen de fecha'))
          ? (get('origen de fecha') as Bet['dateSource'])
          : undefined,
        timingUnknown: normalize(get('en vivo')) === 'sin determinar',
        stake,
        odds,
        potential: num(get('retorno potencial'), true),
        bonus,
        notes: get('observaciones'),
        source: 'import',
        kind:
          normalize(get('tipo')) === 'simple' && selections.length === 1 ? 'Simple' :
          ['combinada', 'doble', 'triple', 'bet builder'].includes(normalize(get('tipo'))) ||
          selectionCount(selections) > 1
            ? 'Combinada'
            : 'Simple',
        live: normalize(get('en vivo')) === 'si',
      },
      selections,
      settlements,
      warnings,
      house: get('casa'),
      currency: get('moneda'),
      status,
    };
  });
}
