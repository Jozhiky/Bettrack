import type { BettrackDB } from './db';
import { supabase } from '../integrations/supabase';
import { ImageCache } from './imageCache';
import { conservativeBookingTime } from './captureClock';

export const collections = ['houses', 'streamers', 'bets', 'selections', 'settlements', 'movements', 'audit', 'images', 'settings', 'uploads'] as const;
type Collection = typeof collections[number];
type Row = { id: string; [key: string]: unknown };
type Records = Record<Collection, Row[]>;
type Envelope = { version: number; records: Records };
const empty = () => Object.fromEntries(collections.map(name => [name, []])) as unknown as Records;
type Predicate = (row: Row) => boolean;
export class CloudConflictError extends Error {
  constructor() { super('Hubo un cambio desde otro dispositivo. Actualizamos los datos; vuelve a intentar.'); this.name = 'CloudConflictError'; }
}
const serializable = (row: Row) => JSON.parse(JSON.stringify({ ...row, blob: undefined }));

class Query {
  private predicates: Predicate[] = [];
  private field?: string;
  private descending = false;
  private skip = 0;
  private take = Infinity;
  constructor(private table: MemoryTable, field?: string) { this.field = field; }
  equals(value: unknown) { this.predicates.push(row => row[this.field!] === value); return this; }
  anyOf(...values: unknown[]) { const list = values.flat(); this.predicates.push(row => list.includes(row[this.field!])); return this; }
  filter(fn: Predicate) { this.predicates.push(fn); return this; }
  reverse() { this.descending = !this.descending; return this; }
  offset(value: number) { this.skip = value; return this; }
  limit(value: number) { this.take = value; return this; }
  async toArray() {
    let rows = this.table.rows.filter(row => this.predicates.every(fn => fn(row)));
    if (this.field) rows.sort((a,b) => String(a[this.field!] ?? '').localeCompare(String(b[this.field!] ?? '')));
    if (this.descending) rows.reverse();
    return structuredClone(rows.slice(this.skip, this.skip + this.take));
  }
  async sortBy(field: string) { return (await this.toArray()).sort((a,b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''))); }
  async count() { return (await this.toArray()).length; }
  async first() { return (await this.toArray())[0]; }
  async primaryKeys() { return (await this.toArray()).map(row => row.id); }
  async delete() { return this.table.store.write(async store => { const rows = await this.toArray(); for (const row of rows) await store.table(this.table.name).delete(row.id); return rows.length; }); }
  async modify(patch: Partial<Row>) { return this.table.store.write(async store => { const rows = await this.toArray(); for (const row of rows) await store.table(this.table.name).update(row.id, patch); return rows.length; }); }
}
class MemoryTable {
  constructor(public store: CloudStore, public name: Collection) {}
  get rows() { return this.store.records[this.name]; }
  async get(id: string) {
    const row = this.rows.find(row => row.id === id);
    if (!row) return undefined;
    if (this.name === 'images' && !row.blob) {
      const blob = await this.store.imageCache.get(String(row.path), async () => {
        const { data, error } = await supabase.storage.from('bettrack-captures').download(String(row.path));
        if (error) throw new Error('No se pudo descargar la captura: ' + error.message);
        return data;
      });
      return { ...structuredClone(row), blob };
    }
    return structuredClone(row);
  }
  async toArray() {
    if (this.name === 'images') return Promise.all(this.rows.map(row => this.get(row.id))) as Promise<Row[]>;
    return structuredClone(this.rows);
  }
  where(field: string) { return new Query(this, field); }
  orderBy(field: string) { return new Query(this, field); }
  filter(fn: Predicate) { return new Query(this).filter(fn); }
  async count() { return this.rows.length; }
  async add(row: Row) { return this.store.write(async store => { if (store.table(this.name).rows.some(r => r.id === row.id)) throw new Error('Registro duplicado.'); store.records[this.name].push(structuredClone(row)); return row.id; }); }
  async put(row: Row) { return this.store.write(async store => { const rows = store.records[this.name]; const index = rows.findIndex(r => r.id === row.id); if (index < 0) rows.push(structuredClone(row)); else rows[index] = structuredClone(row); return row.id; }); }
  async update(id: string, patch: Partial<Row>) { return this.store.write(async store => { const rows = store.records[this.name]; const index = rows.findIndex(r => r.id === id); if (index < 0) return 0; rows[index] = { ...rows[index], ...structuredClone(patch) }; return 1; }); }
  async delete(id: string) { return this.store.write(async store => { store.records[this.name] = store.records[this.name].filter(row => row.id !== id); }); }
  async bulkAdd(rows: Row[]) { for (const row of rows) await this.add(row); }
  async bulkPut(rows: Row[]) { for (const row of rows) await this.put(row); }
}

// A short-lived in-memory unit of work. Only a successful PostgreSQL commit
// becomes visible to React. No disk cache and no offline write queue.
export class CloudStore {
  imageCache = new ImageCache();
  records = empty();
  version = 0;
  userId = '';
  generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private scoped = false;
  private channel?: ReturnType<typeof supabase.channel>;
  private poll?: ReturnType<typeof setInterval>;
  private loaded = false;
  private lastCommit?: { version: number; observedAt: number };
  status = 'Conectando';
  readonly tables = collections.map(name => new MemoryTable(this, name));
  constructor() { for (const table of this.tables) Object.assign(this, { [table.name]: table }); }
  table(name: Collection) { return this.tables.find(table => table.name === name)!; }
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  emit() { this.listeners.forEach(fn => fn()); }
  reset() { this.generation++; this.loaded = false; this.lastCommit = undefined; this.imageCache.clear(); this.userId = ''; this.records = empty(); this.version = 0; if (this.channel) void supabase.removeChannel(this.channel); clearInterval(this.poll); this.emit(); }
  async captureBookingTime() {
    const anchor = this.lastCommit, generation = this.generation;
    if (!anchor || !this.userId) throw Error('Falta una referencia horaria confirmada del servidor. La captura sigue conservada.');
    const {data,error} = await supabase.from('bt_server_audit').select('occurred_at').eq('user_id',this.userId).eq('version',anchor.version).maybeSingle();
    if (error || !data || generation !== this.generation || !Number.isFinite(Date.parse(data.occurred_at)))
      throw Error('No se pudo comprobar la fecha contable del servidor. La captura sigue conservada.');
    // PostgreSQL recorded this instant before our commit response arrived.
    // Elapsed monotonic time keeps the result a conservative server-time bound,
    // Bound by the device clock too: a server-ahead clock must not trip the
    // unchanged future-date guard. Neither bound is a historical wager date.
    return conservativeBookingTime(data.occurred_at, performance.now()-anchor.observedAt);
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const result = this.tail.then(fn, fn); this.tail = result.catch(() => {}); return result; }
  async connect(userId: string) {
    this.reset(); this.userId = userId;
    const generation = this.generation;
    await this.refresh();
    if (generation !== this.generation) return;
    this.channel = supabase.channel(`bt-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'bt_accounts', filter: `user_id=eq.${userId}` }, () => { void this.refresh().catch(() => {}); }).subscribe();
    this.poll = setInterval(() => { if (document.visibilityState === 'visible') void this.refresh().catch(() => {}); }, 30000);
  }
  refresh() { return this.serial(() => this.load(true)); }
  private async load(checkVersion = false) {
    const generation = this.generation;
    if (!this.userId) return;
    if (checkVersion && this.loaded) {
      const result = await supabase.from('bt_accounts').select('version').eq('user_id', this.userId).maybeSingle();
      if (generation !== this.generation) return;
      if (result.error) { this.status = 'Sin conexión con Supabase'; this.emit(); throw new Error(result.error.message); }
      if (result.data && Number(result.data.version) === this.version) {
        if (this.status !== 'Guardado en Supabase') { this.status = 'Guardado en Supabase'; this.emit(); }
        await this.cleanupStorage();
        return;
      }
    }
    const { data, error } = await supabase.rpc('bt_snapshot');
    if (generation !== this.generation) return;
    if (error) { this.status = 'Sin conexión con Supabase'; this.emit(); throw new Error(error.message); }
    const envelope = data as Envelope;
    this.loaded = true;
    this.records = envelope.records; this.version = envelope.version; this.status = 'Guardado en Supabase'; this.emit();
    this.imageCache.retain(new Set(this.records.images.map(row => String(row.path))));
    await this.cleanupStorage();
  }
  private async cleanupStorage() {
    const { data, error } = await supabase.from('bt_storage_cleanup').select('path').limit(100);
    if (error || !data?.length) return;
    const paths = data.map(row => String(row.path));
    const removed = await supabase.storage.from('bettrack-captures').remove(paths);
    if (!removed.error) await supabase.from('bt_storage_cleanup').delete().in('path', paths);
  }
  async transaction<T>(_mode: string, _tables: unknown, fn: (db: BettrackDB) => Promise<T>): Promise<T> {
    if (this.scoped) return fn(this as unknown as BettrackDB);
    if (_mode === 'r') {
      const snapshot = new CloudStore();
      snapshot.scoped = true; snapshot.userId = this.userId;
      snapshot.imageCache = this.imageCache;
      snapshot.records = structuredClone(this.records); snapshot.version = this.version;
      return fn(snapshot as unknown as BettrackDB);
    }
    return this.write(store => fn(store as unknown as BettrackDB));
  }
  async write<T>(fn: (store: CloudStore) => Promise<T>): Promise<T> {
    if (this.scoped) return fn(this);
    const generation = this.generation;
    return this.serial(async () => {
      if (!this.userId || generation !== this.generation) throw new Error('Inicia sesión para guardar.');
      if (!navigator.onLine) throw new Error('Necesitas conexión para guardar en Supabase.');
      const working = new CloudStore(); working.scoped = true; working.userId = this.userId; working.records = structuredClone(this.records);
      working.imageCache = this.imageCache;
      const uploaded: string[] = [];
      const deleted: string[] = [];
      this.status = 'Guardando…'; this.emit();
      try {
        const result = await fn(working);
        const changes: { collection: Collection; id: string; payload: Row | null }[] = [];
        for (const name of collections) {
          const old = new Map(this.records[name].map(row => [row.id, row]));
          for (const row of working.records[name]) {
            if (name === 'images' && row.blob instanceof Blob && !old.has(row.id)) {
              const path = `${this.userId}/${crypto.randomUUID()}`;
              const { error } = await supabase.storage.from('bettrack-captures').upload(path, row.blob, { contentType: row.blob.type, cacheControl: '0', upsert: false });
              if (error) throw new Error('No se pudo subir la captura: ' + error.message);
              uploaded.push(path); row.path = path;
            }
            // Re-reading an existing image must retain its private object path.
            if (name === 'images' && old.has(row.id)) row.path = old.get(row.id)!.path;
            const clean = serializable(row);
            if (JSON.stringify(clean) !== JSON.stringify(old.has(row.id) ? serializable(old.get(row.id)!) : null)) changes.push({ collection: name, id: row.id, payload: clean });
            old.delete(row.id);
          }
          for (const row of old.values()) { changes.push({ collection: name, id: row.id, payload: null }); if (name === 'images') deleted.push(String(row.path)); }
        }
        if (generation !== this.generation) throw new Error('La sesión cambió durante el guardado.');
        if (changes.length) {
          if (changes.some(c => c.collection === 'bets' && c.payload?.dateSource === 'accounting')) {
            const supported = await supabase.rpc('bt_capabilities');
            if (supported.error || supported.data?.automaticHistoricalBooking !== true)
              throw new Error('La importación automática necesita la actualización autorizada del esquema. El lote y sus imágenes siguen conservados.');
          }
          if (changes.some(c => c.collection === 'bets' && c.payload && (c.payload.odds === null || c.payload.potential === null))) {
            const capability = await supabase.rpc('bt_capabilities');
            if (capability.error || capability.data?.historicalUnknownQuote !== true)
              throw new Error('El backend todavía no admite históricos con cuota o potencial desconocidos. Se requiere la actualización autorizada de la base de datos; tu captura sigue en revisión.');
          }
          const { data, error } = await supabase.rpc('bt_commit', { expected_version: this.version, changes });
          if (error) throw error.message.includes('BT_CONFLICT') ? new CloudConflictError() : new Error(error.message);
          if (generation !== this.generation) throw new Error('La sesión cambió durante el guardado.');
          this.version = Number(data); this.records = working.records;
          this.lastCommit = { version: this.version, observedAt: performance.now() };
          for (const row of this.records.images) if (row.blob instanceof Blob) { this.imageCache.put(String(row.path), row.blob); delete row.blob; }
          this.imageCache.retain(new Set(this.records.images.map(row => String(row.path))));
        }
        this.status = 'Guardado en Supabase'; this.emit();
        if (deleted.length) await this.cleanupStorage();
        return result;
      } catch (error) {
        // Uploaded orphans are private. A cleanup queue also handles deleted objects.
        // A lost HTTP response can still mean PostgreSQL committed. Re-read
        // before deleting any uploaded object; retain it if the outcome is unknown.
        let refreshed = false;
        await this.load().then(() => { refreshed = generation === this.generation; }).catch(() => {});
        if (uploaded.length && refreshed) {
          const referenced = new Set(this.records.images.map(row => row.path));
          const orphans = uploaded.filter(path => !referenced.has(path));
          if (orphans.length) await supabase.storage.from('bettrack-captures').remove(orphans);
        }
        throw error;
      }
    });
  }
}
export const cloudStore = new CloudStore();
// The adapter deliberately implements the small Table/Collection API used by
// the domain repository; Dexie is type-only and never loaded in production.
export const cloudDatabase = cloudStore as unknown as BettrackDB;

export function transact<T>(database: BettrackDB, mode: 'r' | 'rw', tables: unknown, fn: (scope: BettrackDB) => Promise<T>): Promise<T> {
  if (database instanceof CloudStore) return database.transaction(mode, tables, fn);
  // Legacy IndexedDB adapters exist only for isolated domain regression tests.
  return database.transaction(mode, tables as BettrackDB['tables'], async () => fn(database));
}
