// Loaded ONLY by the isolated Vite runner, never by the production build.
import 'fake-indexeddb/auto';
import { liveQuery } from 'dexie';
import { db, type BettrackDB } from '../../src/data/db';
export const cloudDatabase = db;
export function failUploadOnce(name: string) {
  const fail = (_key: unknown, image: { name?: string }) => {
    if (image.name !== name) return;
    db.images.hook('creating').unsubscribe(fail);
    throw new Error('Fallo de subida sintético QA; reintenta esta imagen.');
  };
  db.images.hook('creating', fail);
}
export const cloudStore = {
  generation: 0,
  subscribe(callback: () => void) {
    const sub = liveQuery(() => Promise.all(db.tables.map((t) => t.toArray()))).subscribe(callback);
    return () => sub.unsubscribe();
  },
};
export function transact<T>(
  database: BettrackDB,
  mode: 'r' | 'rw',
  tables: unknown,
  fn: (scope: BettrackDB) => Promise<T>,
): Promise<T> {
  return database.transaction(mode, tables as BettrackDB['tables'], () => fn(database));
}
