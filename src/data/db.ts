import Dexie, { type Table } from 'dexie';
import type {
  Bet,
  Selection,
  StoredSettlement,
  Master,
  Movement,
  Audit,
  StoredImage,
  Settings,
  CaptureUpload,
} from '../domain/model';
export class BettrackDB extends Dexie {
  houses!: Table<Master, string>;
  streamers!: Table<Master, string>;
  bets!: Table<Bet, string>;
  selections!: Table<Selection, string>;
  settlements!: Table<StoredSettlement, string>;
  movements!: Table<Movement, string>;
  audit!: Table<Audit, string>;
  images!: Table<StoredImage, string>;
  settings!: Table<Settings, string>;
  uploads!: Table<CaptureUpload, string>;
  constructor(name = 'bettrack-local-v1') {
    super(name);
    this.version(1).stores({
      houses: 'id,name',
      streamers: 'id,name',
      bets: 'id,date,houseId,streamerId,fingerprint,imageId',
      selections: 'id,betId',
      settlements: 'id,betId,date',
      movements: 'id,houseId,betId,settlementId,transferId,date',
      audit: 'id,date,entityId',
      images: 'id,hash',
      settings: 'id',
    });
    this.version(2).stores({ uploads: 'id,imageId,status,createdAt,betId' });
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        const oldBets = await tx
          .table('bets')
          .filter((b) => ['Doble', 'Triple', 'Bet Builder'].includes(b.kind))
          .toArray();
        for (const before of oldBets) {
          const after = { ...before, kind: 'Combinada' };
          await tx.table('bets').put(after);
          await tx.table('audit').add({
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            action: 'Normalizar tipo de apuesta',
            entityId: before.id,
            before: JSON.stringify(before),
            after: JSON.stringify(after),
          });
        }
      });
  }
}
export const db = new BettrackDB();
