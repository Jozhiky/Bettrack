import type { BettrackDB } from './db';
import { cloudDatabase, transact } from './cloudStore';
import { releasableImages } from './storagePolicy';
import {
  betSchema,
  selectionSchema,
  settlementSchema,
  masterSchema,
  movementSchema,
  id,
  timestamp,
  fingerprint,
  selectionCount,
  defaultSettings,
  type Bet,
  type Selection,
  type Settlement,
  type Master,
  type Movement,
  type Snapshot,
  type StoredImage,
} from '../domain/model';
export interface BetRepository {
  snapshot(): Promise<Snapshot>;
  saveBet(b: Bet, selections: Selection[], image?: StoredImage): Promise<void>;
  settle(s: Settlement): Promise<void>;
  deleteBet(id: string): Promise<void>;
}
export class LocalRepository implements BetRepository {
  constructor(public database: BettrackDB = cloudDatabase) {}
  async init() {
    await transact(this.database,
      'rw',
      this.database.tables,
      async (d) => {
        if (!(await d.settings.get('settings'))) {
          await d.settings.add(defaultSettings);
          await d.houses.bulkAdd(
            ['Betano', 'Bet365'].map((name, i) =>
              masterSchema.parse({ id: `house-${i}`, name, active: true }),
            ),
          );

        }
      },
    );
  }
  async snapshot(): Promise<Snapshot> {
    const d = this.database;
    return transact(d,
      'r',
      [d.houses, d.streamers, d.bets, d.selections, d.settlements, d.movements, d.audit],
      async (d) => ({
        houses: await d.houses.toArray(),
        streamers: await d.streamers.toArray(),
        bets: await d.bets.toArray(),
        selections: (await d.selections.toArray()).sort(
          (a, b) => a.betId.localeCompare(b.betId) || (a.order ?? 0) - (b.order ?? 0),
        ),
        settlements: await d.settlements.toArray(),
        movements: await d.movements.toArray(),
        audit: await d.audit.toArray(),
      }),
    );
  }
  private async audit(d: BettrackDB, action: string, entityId: string, before: unknown, after: unknown) {
    await d.audit.add({
      id: id(),
      date: timestamp(),
      action,
      entityId,
      before: JSON.stringify(before ?? null),
      after: JSON.stringify(after ?? null),
    });
  }
  async saveMaster(type: 'houses' | 'streamers', raw: Master) {
    const m = masterSchema.parse(raw);
    const d = this.database;
    await transact(d,'rw', [d[type], d.audit, d.bets, d.movements], async (d) => {
      const before = await d[type].get(m.id);
      if (
        type === 'houses' &&
        before?.currency !== m.currency &&
        ((await d.bets.where('houseId').equals(m.id).count()) ||
          (await d.movements.where('houseId').equals(m.id).count()))
      )
        throw new Error('La moneda de una billetera con movimientos no se puede cambiar.');
      await d[type].put(m);
      await this.audit(d,'Guardar ' + type, m.id, before, m);
    });
  }
  async deleteMaster(type: 'houses' | 'streamers', key: string) {
    const d = this.database;
    await transact(d,'rw', [d[type], d.audit, d.bets, d.movements], async (d) => {
      if (
        (await d.bets
          .where(type === 'houses' ? 'houseId' : 'streamerId')
          .equals(key)
          .count()) ||
        (type === 'houses' && (await d.movements.where('houseId').equals(key).count()))
      )
        throw new Error(
          'Tiene registros vinculados. Puedes desactivarlo para conservar el historial.',
        );
      const before = await d[type].get(key);
      await d[type].delete(key);
      await this.audit(d,'Eliminar ' + type, key, before, null);
    });
  }
  async saveBet(raw: Bet, rows: Selection[], image?: StoredImage, allowUnfundedCapture = false) {
    const b = betSchema.parse(raw);
    const selections = rows.map((s, order) => selectionSchema.parse({ ...s, betId: b.id, order }));
    if (!selections.length) throw new Error('Agrega al menos una selección.');
    if (
      (b.kind === 'Simple' && selections.length !== 1) ||
      (b.kind === 'Combinada' && selectionCount(selections) < 2)
    )
      throw new Error('El número de selecciones no coincide con el tipo de apuesta.');
    b.fingerprint = fingerprint(b, selections);
    const d = this.database;
    await transact(d,
      'rw',
      [d.bets, d.selections, d.settlements, d.movements, d.audit, d.images, d.houses, d.streamers],
      async (d) => {
        const house = await d.houses.get(b.houseId);
        if (!house) throw new Error('Casa no encontrada.');
        if (b.streamerId && !(await d.streamers.get(b.streamerId)))
          throw new Error('Streamer no encontrado.');
        const before = await d.bets.get(b.id);
        const oldSelections = await d.selections.where('betId').equals(b.id).toArray();
        const settlements = await d.settlements.where('betId').equals(b.id).toArray();
        if (
          settlements.length &&
          before &&
          (before.stake !== b.stake || before.houseId !== b.houseId || before.date !== b.date)
        )
          throw new Error(
            'Revierte primero las liquidaciones para cambiar monto, fecha o billetera.',
          );
        const moves = await d.movements.where('houseId').equals(b.houseId).toArray();
        const available = moves.reduce(
          (a, m) => a + (m.betId === b.id && m.kind === 'Apuesta colocada' ? 0 : m.amount),
          0,
        );
        const trackingCapture =
          (allowUnfundedCapture || before?.dateSource === 'upload') && b.source === 'ocr';
        if (available < b.stake && !before && !trackingCapture)
          throw new Error('Saldo insuficiente. Registra primero capital inicial o un depósito.');
        if (before && available < b.stake && !settlements.length && !trackingCapture)
          throw new Error('Saldo insuficiente para este cambio.');
        await d.bets.put(b);
        await d.selections.where('betId').equals(b.id).delete();
        await d.selections.bulkAdd(selections);
        await d.movements
          .where('betId')
          .equals(b.id)
          .filter((m) => m.kind === 'Apuesta colocada')
          .delete();
        await d.movements.add({
          id: `stake-${b.id}`,
          houseId: b.houseId,
          date: b.date,
          kind: 'Apuesta colocada',
          amount: -b.stake,
          note: 'Stake reservado',
          betId: b.id,
        });
        if (image) await d.images.put(image);
        await this.audit(d,
          before ? 'Editar apuesta' : 'Crear apuesta',
          b.id,
          { bet: before, selections: oldSelections },
          { bet: b, selections },
        );
      },
    );
  }
  async settle(raw: Settlement) {
    const s = settlementSchema.parse(raw);
    const d = this.database;
    await transact(d,'rw', [d.bets, d.settlements, d.movements, d.audit], async (d) => {
      const b = await d.bets.get(s.betId);
      if (!b) throw new Error('Apuesta no encontrada.');
      if (await d.settlements.where('betId').equals(b.id).count())
        throw new Error('La apuesta ya tiene un resultado. Reviértelo antes de cambiarlo.');
      if (s.closedStake !== b.stake)
        throw new Error('El resultado debe cerrar el monto completo de la apuesta.');
      if (s.date < b.date) throw new Error('La liquidación no puede ser anterior a la apuesta.');
      if (s.kind === 'Perdida' && s.returned !== 0)
        throw new Error('Una apuesta perdida debe devolver cero.');
      await d.settlements.add(s);
      await d.movements.add({
        id: id(),
        houseId: b.houseId,
        date: s.date,
        kind: s.kind === 'Cashout' ? 'Cashout' : 'Apuesta liquidada',
        amount: s.returned,
        note: s.note,
        betId: b.id,
        settlementId: s.id,
      });
      await this.audit(d,'Liquidar apuesta', s.betId, null, s);
    });
  }
  async undoSettlement(key: string) {
    const d = this.database;
    await transact(d,'rw', [d.settlements, d.movements, d.audit], async (d) => {
      const before = await d.settlements.get(key);
      if (!before) throw new Error('Liquidación no encontrada.');
      await d.settlements.delete(key);
      await d.movements.where('settlementId').equals(key).delete();
      await this.audit(d,'Revertir liquidación', before.betId, before, null);
    });
  }
  async deleteBet(key: string) {
    const d = this.database;
    await transact(d,
      'rw',
      [d.bets, d.selections, d.settlements, d.movements, d.audit, d.images, d.uploads],
      async (d) => {
        const before = {
          bet: await d.bets.get(key),
          selections: await d.selections.where('betId').equals(key).toArray(),
          settlements: await d.settlements.where('betId').equals(key).toArray(),
        };
        await d.bets.delete(key);
        await d.selections.where('betId').equals(key).delete();
        await d.settlements.where('betId').equals(key).delete();
        await d.movements.where('betId').equals(key).delete();
        const linked = await d.uploads
          .where('betId')
          .equals(key)
          .filter((u) => u.status === 'linked' || u.status === 'saved')
          .toArray();
        for (const u of linked) {
          await d.uploads.delete(u.id);
        }
        await d.uploads.where('betId').equals(key).modify({
          betId: undefined,
          status: 'review',
          reason: 'La apuesta vinculada fue eliminada. Puedes volver a leer esta captura.',
        });
        for (const imageId of new Set([before.bet?.imageId, ...linked.map(u => u.imageId)]))
          if (imageId) await this.deleteUnreferencedImage(d, imageId);
        await this.audit(d,'Eliminar apuesta y revertir movimientos', key, before, null);
      },
    );
  }
  async removeImage(betId: string) {
    const d = this.database;
    await transact(d,'rw', [d.bets, d.images, d.audit, d.uploads], async (d) => {
      const b = await d.bets.get(betId);
      if (!b?.imageId) return;
      await d.bets.update(b.id, { imageId: undefined });
      await d.uploads.where('imageId').equals(b.imageId).filter(u => u.betId === b.id && ['saved', 'linked'].includes(u.status)).delete();
      await this.deleteUnreferencedImage(d, b.imageId);
      await this.audit(d,'Eliminar captura', b.id, b.imageId, null);
    });
  }
  async removeSettledImages(imageIds: string[]) {
    const d = this.database;
    return transact(d, 'rw', [d.bets, d.settlements, d.images, d.uploads, d.audit], async d => {
      const allowed = releasableImages(imageIds, await d.bets.toArray(), await d.settlements.toArray(), await d.uploads.toArray());
      for (const imageId of allowed) {
        await d.bets.filter(b => b.imageId === imageId).modify({ imageId: undefined });
        await d.uploads.where('imageId').equals(imageId).delete();
        await d.images.delete(imageId);
        await this.audit(d, 'Liberar captura de apuestas terminadas', imageId, { imageId }, null);
      }
      return allowed.length;
    });
  }
  private async deleteUnreferencedImage(d: BettrackDB, imageId: string) {
    if (!(await d.bets.filter(b => b.imageId === imageId).count()) &&
        !(await d.uploads.where('imageId').equals(imageId).count())) await d.images.delete(imageId);
  }
  async removePendingCapture(uploadId: string) {
    const d = this.database;
    await transact(d, 'rw', [d.uploads, d.images, d.bets, d.audit], async (d) => {
      const upload = await d.uploads.get(uploadId);
      if (!upload) return; // Another tab may already have removed it.
      if (!['queued', 'processing', 'review', 'error', 'duplicate'].includes(upload.status))
        throw new Error('La captura ya está registrada. Abre el detalle de la apuesta para quitar su imagen.');
      await d.uploads.delete(upload.id);
      const referencedByBet = await d.bets.filter(b => b.imageId === upload.imageId).count();
      const referencedByUpload = await d.uploads.where('imageId').equals(upload.imageId).count();
      if (!referencedByBet && !referencedByUpload) await d.images.delete(upload.imageId);
      await this.audit(d, 'Quitar captura pendiente', upload.id, upload, null);
    });
  }
  async removeLinkedCapture(uploadId: string) {
    const d = this.database;
    await transact(d,'rw', [d.uploads, d.images, d.bets, d.audit], async (d) => {
      const u = await d.uploads.get(uploadId);
      if (!u || u.status !== 'linked') throw new Error('Actualización no disponible.');
      await d.uploads.delete(u.id);
      await this.deleteUnreferencedImage(d, u.imageId);
      await this.audit(d,'Eliminar captura vinculada', u.betId!, u, null);
    });
  }
  async move(raw: Movement, destination?: string) {
    const m = movementSchema.parse(raw);
    if (
      m.betId ||
      m.settlementId ||
      ['Apuesta colocada', 'Apuesta liquidada', 'Cashout', 'Reembolso'].includes(m.kind)
    )
      throw new Error('Movimiento reservado para apuestas.');
    if (!m.amount) throw new Error('El importe no puede ser cero.');
    if (
      (['Capital inicial', 'Depósito'].includes(m.kind) && m.amount < 0) ||
      (m.kind === 'Retiro' && m.amount > 0)
    )
      throw new Error('Signo de importe inválido.');
    if (m.kind === 'Ajuste' && !m.note.trim()) throw new Error('El ajuste requiere un motivo.');
    const d = this.database;
    await transact(d,'rw', [d.movements, d.houses, d.audit], async (d) => {
      const h = await d.houses.get(m.houseId);
      if (!h) throw new Error('Casa no encontrada.');
      if (
        m.kind === 'Capital inicial' &&
        (await d.movements
          .where('houseId')
          .equals(m.houseId)
          .filter((x) => x.kind === 'Capital inicial')
          .count())
      )
        throw new Error('Ya existe capital inicial para esta casa. Usa un depósito o un ajuste.');
      const balance = (await d.movements.where('houseId').equals(m.houseId).toArray()).reduce(
        (a, x) => a + x.amount,
        0,
      );
      if (m.amount < 0 && balance + m.amount < 0 && m.kind !== 'Ajuste')
        throw new Error('Saldo insuficiente.');
      if (m.kind === 'Transferencia') {
        const dest = destination ? await d.houses.get(destination) : undefined;
        if (!dest || dest.id === h.id || dest.currency !== h.currency || m.amount >= 0)
          throw new Error('Elige otra casa con la misma moneda.');
        const transferId = id();
        m.transferId = transferId;
        await d.movements.add({ ...m, id: id(), houseId: dest.id, amount: -m.amount });
      }
      await d.movements.add(m);
      await this.audit(d,'Registrar movimiento', m.id, null, m);
    });
  }
}
export const repo = new LocalRepository();
