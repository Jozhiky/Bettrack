import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import {
  id,
  timestamp,
  position,
  totals,
  money,
  toCents,
  fingerprint,
  kinds,
  states,
  settlementSchema,
  type Bet,
  type Selection,
  type Settlement,
} from '../domain/model';
import { parseTicket, classifyMarket } from '../ocr/parser';
import { hashImage } from '../ocr/engine';
import { parseCSV, validateBackup, exportCSV } from '../data/transfer';
let db: BettrackDB, r: LocalRepository;
const now = '2026-10-15T17:00:00.000Z';
function fixture(overrides: Partial<Bet> = {}, count = 1) {
  const bet: Bet = {
    id: id(),
    date: now,
    houseId: 'house-0',
    streamerId: '',
    kind: count === 1 ? 'Simple' : 'Combinada',
    live: false,
    odds: 2,
    stake: 1000,
    potential: 2000,
    notes: '',
    source: 'manual',
    fingerprint: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  const selections: Selection[] = Array.from({ length: count }, (_, i) => ({
    id: id(),
    betId: bet.id,
    event: `Local ${i} vs Visitante`,
    sport: 'Fútbol',
    league: 'Liga',
    market: 'Goles del partido',
    pick: 'Más de 2.5',
    odds: 2,
  }));
  return { bet, selections };
}
async function capital(amount = 10000, houseId = 'house-0') {
  await r.move({ id: id(), date: now, houseId, kind: 'Capital inicial', amount, note: '' });
}
async function saved(overrides: Partial<Bet> = {}, count = 1) {
  const f = fixture(overrides, count);
  await r.saveBet(f.bet, f.selections);
  return f.bet;
}
async function settle(b: Bet, kind: Settlement['kind'], returned: number, closedStake = b.stake) {
  const s = { id: id(), betId: b.id, date: now, kind, returned, closedStake, note: '' };
  await r.settle(s);
  return s;
}
beforeEach(async () => {
  db = new BettrackDB('test-' + id());
  r = new LocalRepository(db);
  await r.init();
});
afterEach(async () => {
  await db.delete();
});
it('accepts one Simple Bet Builder leg but rejects two separate legs as Simple', async () => {
  await capital();
  const f=fixture();
  f.selections[0].market='Bet Builder';
  f.selections[0].builderMarkets=[{pick:'Sí',market:'Ambos equipos anotan'},{pick:'Más de 2.5',market:'Goles totales Más/Menos'}];
  await r.saveBet(f.bet,f.selections);
  expect((await db.bets.get(f.bet.id))?.kind).toBe('Simple');
  expect(await db.movements.filter(m=>m.betId===f.bet.id).count()).toBe(1);
  const snapshot=await r.snapshot();
  const backup={format:'bettrack',version:1,createdAt:timestamp(),data:snapshot,images:[],settings:await db.settings.get('settings')};
  expect(validateBackup(backup).data.bets[0].kind).toBe('Simple');
  const imported=parseCSV(exportCSV(snapshot))[0];
  expect(imported.bet.kind).toBe('Simple');
  expect(imported.selections[0].builderMarkets).toEqual(f.selections[0].builderMarkets);
  const invalid=fixture({kind:'Simple'},2);
  await expect(r.saveBet(invalid.bet,invalid.selections)).rejects.toThrow('número de selecciones');
  expect(await db.bets.count()).toBe(1);
});
describe('Contabilidad y persistencia', () => {
  it('solo admite dos tipos y cuatro estados; rechaza resultados retirados', () => {
    expect(kinds).toEqual(['Simple', 'Combinada']);
    expect(states).toEqual(['Pendiente', 'Ganada', 'Perdida', 'Cashout']);
    for (const kind of ['Anulada', 'Parcial']) {
      expect(
        settlementSchema.safeParse({
          id: id(),
          betId: id(),
          date: now,
          kind,
          closedStake: 1000,
          returned: 1000,
          note: '',
        }).success,
      ).toBe(false);
    }
  });
  it('migra tipos antiguos conservando selecciones, cobros y auditoría', async () => {
    const name = 'migration-' + id();
    const legacy = new Dexie(name);
    legacy
      .version(2)
      .stores(
        Object.fromEntries(
          db.tables.map((t) => [
            t.name,
            [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(','),
          ]),
        ),
      );
    const f = fixture({}, 2);
    const payment = {
      id: id(),
      betId: f.bet.id,
      date: now,
      kind: 'Cashout',
      closedStake: 400,
      returned: 500,
      note: '',
    };
    await legacy.table('bets').add({ ...f.bet, kind: 'Doble' });
    await legacy.table('selections').bulkAdd(f.selections);
    await legacy.table('settlements').add(payment);
    legacy.close();
    const upgraded = new BettrackDB(name);
    try {
      await upgraded.open();
      expect((await upgraded.bets.get(f.bet.id))?.kind).toBe('Combinada');
      expect(await upgraded.selections.toArray()).toEqual(expect.arrayContaining(f.selections));
      expect(await upgraded.settlements.toArray()).toEqual([payment]);
      expect(await upgraded.audit.count()).toBe(1);
      const oldPosition = position(f.bet, [payment as Settlement]);
      expect(oldPosition).toMatchObject({
        status: 'Pendiente',
        needsReview: true,
        returned: 500,
        remaining: 600,
        profit: 100,
      });
      await expect(
        new LocalRepository(upgraded).settle({
          ...payment,
          kind: 'Perdida',
          closedStake: 1000,
          returned: 0,
        }),
      ).rejects.toThrow('ya tiene un resultado');
    } finally {
      await upgraded.delete();
    }
  });
  it('persiste, edita y respalda mercados de un Bet Builder sin duplicar stake', async () => {
    await capital();
    const f = fixture({ kind: 'Combinada', bonus: { amount: 500, treatment: 'Sin confirmar' } });
    f.selections[0].market = 'Bet Builder';
    f.selections[0].pick = 'Bet Builder';
    f.selections[0].builderMarkets = [
      { market: 'Tiros al arco del jugador', pick: '1+', promotion: 'Suplente de Oro' },
      { market: 'Córners', pick: 'Más de 6.5' },
    ];
    await r.saveBet(f.bet, f.selections);
    db.close();
    await db.open();
    expect((await db.selections.toArray())[0].builderMarkets).toEqual(
      f.selections[0].builderMarkets,
    );
    f.selections[0].builderMarkets[1].pick = 'Más de 8.5';
    await r.saveBet(f.bet, f.selections);
    const data = await r.snapshot();
    expect(data.bets[0].bonus).toEqual(f.bet.bonus);
    expect(parseCSV(exportCSV(data))[0].bet.bonus).toEqual(f.bet.bonus);
    expect(totals(data)).toMatchObject({ available: 9000, committed: 1000, profit: 0 });
    expect(data.movements.filter((m) => m.kind === 'Apuesta colocada')).toHaveLength(1);
    expect(parseCSV(exportCSV(data))[0].selections[0].builderMarkets).toEqual(
      f.selections[0].builderMarkets,
    );
    expect(
      validateBackup({
        format: 'bettrack',
        version: 1,
        createdAt: timestamp(),
        data,
        images: [],
        settings: await db.settings.get('settings'),
      }).data.selections[0].builderMarkets,
    ).toEqual(f.selections[0].builderMarkets);
  });
  it('registra capital sin beneficio y persiste una apuesta simple', async () => {
    await capital();
    const b = await saved();
    let d = await r.snapshot();
    expect(totals(d)).toMatchObject({ bank: 10000, available: 9000, committed: 1000, profit: 0 });
    db.close();
    await db.open();
    d = await r.snapshot();
    expect(d.bets[0].id).toBe(b.id);
    expect(d.selections).toHaveLength(1);
  });
  it('guarda combinadas como selecciones relacionadas', async () => {
    await capital();
    const b = await saved({}, 3);
    expect(await db.selections.where('betId').equals(b.id).count()).toBe(3);
  });
  it.each([
    ['Cashout', 3000, 2000],
    ['Cashout', 500, -500],
    ['Perdida', 0, -1000],
    ['Ganada', 2000, 1000],
  ] as const)('%s: retorno %i produce beneficio %i', async (kind, returned, profit) => {
    await capital();
    const b = await saved();
    await settle(b, kind, returned);
    expect(totals(await r.snapshot())).toMatchObject({
      profit,
      available: 10000 + profit,
      committed: 0,
    });
  });
  it('rechaza cierres parciales y un segundo resultado sin modificar el saldo', async () => {
    await capital();
    const b = await saved();
    await expect(settle(b, 'Cashout', 1000, 400)).rejects.toThrow('monto completo');
    expect(totals(await r.snapshot())).toMatchObject({
      profit: 0,
      available: 9000,
      committed: 1000,
    });
    await settle(b, 'Cashout', 1000);
    expect(totals(await r.snapshot())).toMatchObject({ profit: 0, available: 10000, committed: 0 });
    await expect(settle(b, 'Perdida', 0)).rejects.toThrow('ya tiene un resultado');
    expect(await db.settlements.count()).toBe(1);
  });
  it('depósito, retiro y transferencia no modifican ganancias', async () => {
    await capital();
    await r.move({
      id: id(),
      date: now,
      houseId: 'house-0',
      kind: 'Depósito',
      amount: 2000,
      note: '',
    });
    await r.move({
      id: id(),
      date: now,
      houseId: 'house-0',
      kind: 'Retiro',
      amount: -500,
      note: '',
    });
    await r.move(
      { id: id(), date: now, houseId: 'house-0', kind: 'Transferencia', amount: -3000, note: '' },
      'house-1',
    );
    const d = await r.snapshot();
    expect(totals(d)).toMatchObject({
      profit: 0,
      available: 11500,
      deposits: 2000,
      withdrawals: 500,
    });
    expect(
      d.movements.filter((m) => m.houseId === 'house-1').reduce((a, m) => a + m.amount, 0),
    ).toBe(3000);
  });
  it('rechaza saldo insuficiente sin escrituras parciales', async () => {
    await expect(saved()).rejects.toThrow('Saldo insuficiente');
    expect(await db.bets.count()).toBe(0);
    expect(await db.selections.count()).toBe(0);
  });
  it('una liquidación inválida se revierte atómicamente', async () => {
    await capital();
    const b = await saved();
    await expect(settle(b, 'Perdida', 500)).rejects.toThrow('devolver cero');
    expect(await db.settlements.count()).toBe(0);
    expect(await db.movements.count()).toBe(2);
  });
  it('recalcula al revertir un estado y conserva auditoría', async () => {
    await capital();
    const b = await saved();
    const s = await settle(b, 'Ganada', 2000);
    await r.undoSettlement(s.id);
    expect(totals(await r.snapshot())).toMatchObject({
      profit: 0,
      committed: 1000,
      available: 9000,
    });
    expect((await db.audit.toArray()).some((a) => a.action === 'Revertir liquidación')).toBe(true);
  });
  it('edición de stake ajusta reserva y eliminación revierte operaciones', async () => {
    await capital();
    const f = fixture();
    await r.saveBet(f.bet, f.selections);
    await r.saveBet({ ...f.bet, stake: 2000 }, f.selections);
    expect(totals(await r.snapshot()).available).toBe(8000);
    await r.deleteBet(f.bet.id);
    expect(totals(await r.snapshot()).available).toBe(10000);
    expect(await db.selections.count()).toBe(0);
  });
  it('no permite cambiar stake ya liquidado', async () => {
    await capital();
    const f = fixture();
    await r.saveBet(f.bet, f.selections);
    await settle(f.bet, 'Cashout', 500);
    await expect(r.saveBet({ ...f.bet, stake: 2000 }, f.selections)).rejects.toThrow('Revierte');
  });
  it('separa monedas y bloquea transferencias cruzadas', async () => {
    await capital();
    const house = await db.houses.get('house-1');
    await r.saveMaster('houses', { ...house!, currency: 'USD' });
    await capital(5000, 'house-1');
    expect(totals(await r.snapshot(), 'PEN').bank).toBe(10000);
    expect(totals(await r.snapshot(), 'USD').bank).toBe(5000);
    await expect(
      r.move(
        { id: id(), date: now, houseId: 'house-0', kind: 'Transferencia', amount: -1000, note: '' },
        'house-1',
      ),
    ).rejects.toThrow('misma moneda');
  });
  it('procesa liquidaciones concurrentes sin duplicar stake', async () => {
    await capital();
    const b = await saved();
    const results = await Promise.allSettled([
      settle(b, 'Ganada', 2000),
      settle(b, 'Ganada', 2000),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.settlements.count()).toBe(1);
  });
  it('duplicados semánticos son advertencias y no bloqueo permanente', async () => {
    await capital();
    const f = fixture();
    const fp = fingerprint(f.bet, f.selections);
    await r.saveBet(f.bet, f.selections);
    const second = { ...f.bet, id: id() };
    await r.saveBet(
      second,
      f.selections.map((s) => ({ ...s, id: id() })),
    );
    expect((await db.bets.toArray()).every((b) => b.fingerprint === fp)).toBe(true);
    expect(await db.bets.count()).toBe(2);
  });
});
describe('Normalización, OCR e importaciones', () => {
  it('no importa estados retirados ni cobros incompletos como resultados nuevos', async () => {
    for (const status of ['Anulada', 'Parcial']) {
      const row = parseCSV(`Apuesta,Monto apostado,Cuota,Estado\nA vs B,10,2,${status}`)[0];
      expect(row.settlements).toEqual([]);
      expect(row.warnings.length).toBeGreaterThan(0);
    }
    await capital();
    const bet = await saved();
    const data = await r.snapshot();
    data.settlements = [
      {
        id: id(),
        betId: bet.id,
        date: now,
        kind: 'Cashout',
        returned: 500,
        closedStake: 400,
        note: '',
      },
    ];
    const imported = parseCSV(exportCSV(data))[0];
    expect(imported.settlements).toEqual([]);
    expect(imported.warnings.join(' ')).toContain('monto completo');
  });
  it('rechaza fechas inexistentes y reconoce importes OCR con miles', () => {
    const row = parseCSV('Apuesta,Monto apostado,Cuota,Fecha\nA vs B,10,2,31/02/2026')[0];
    expect(row.bet.date).toBeUndefined();
    const parsed = parseTicket('Bet365\nTotal de la apuesta S/ 1,234.56\nCash out S/ 500.00');
    expect(parsed.stake).toBe(123456);
    expect(parsed.cashoutOffer).toBe(50000);
  });
  it.each(['S/7.00', 'S/ 7,00', '7.00', '7,00'])('normaliza %s a céntimos', (v) =>
    expect(toCents(v)).toBe(700),
  );
  it('normaliza miles y rechaza números ambiguos', () => {
    expect(toCents('1,234.56')).toBe(123456);
    expect(toCents('1.234,56')).toBe(123456);
    expect(() => toCents('abc')).toThrow();
    expect(() => toCents('1.005')).toThrow('dos decimales');
    expect(toCents('1.15')).toBe(115);
    expect(money(-500)).toContain('5.00');
  });
  it('no toma un cashout ofrecido como liquidación', () => {
    const p = parseTicket(
      'Betano\nCombinada\nCuota total 2,00\nImporte apostado S/ 7,00\nRetorno potencial S/15.00\nCashout S/ 5.00',
    );
    expect(p).toMatchObject({
      house: 'Betano',
      stake: 700,
      odds: 2,
      potential: 1500,
      cashoutOffer: 500,
    });
    expect(p.warnings.some((w) => w.includes('difiere'))).toBe(true);
  });
  it('mantiene ausentes los campos no visibles', () => {
    expect(parseTicket('texto desconocido').stake).toBeUndefined();
    expect(parseTicket('texto desconocido').selections).toHaveLength(0);
  });
  it.each([
    ['Más de 2.5 goles del equipo', 'Goles · equipo · partido completo'],
    ['Más de 1.5 goles primer tiempo', 'Goles · partido · primer tiempo'],
    ['Tiros al arco del equipo', 'Tiros al arco · equipo · partido completo'],
    ['Córners totales', 'Córners · partido · partido completo'],
    ['Total asiático 2.25', 'Total asiático · partido · partido completo'],
  ])('distingue mercado %s', (input, expected) => expect(classifyMarket(input)).toBe(expected));
  it('detecta imágenes idénticas con SHA-256', async () => {
    const blob = {
      arrayBuffer: async () => new TextEncoder().encode('image bytes').buffer,
    } as Blob;
    expect(await hashImage(blob)).toHaveLength(64);
    expect(await hashImage(blob)).toBe(await hashImage(blob));
  });
  it('lee CSV de Sheets y conserva cashout confirmado, monto y fecha', () => {
    const rows = parseCSV(
      'Apuesta,Monto apostado,Cuota,Monto cashout,Estado,Resultado,Fecha\nA vs B,10,2,5,Cashout,-5,15/10/2026',
    );
    expect(rows[0].bet).toMatchObject({ stake: 1000, odds: 2, date: '2026-10-15T17:00:00.000Z' });
    expect(rows[0].settlements[0]).toMatchObject({
      returned: 500,
      kind: 'Cashout',
      closedStake: 1000,
    });
  });
  it('conserva cashout aunque la fecha requiera corrección manual', () => {
    const row = parseCSV(
      'Apuesta,Monto apostado,Cuota,Monto cashout,Estado\nA vs B,10,2,5,Cashout',
    )[0];
    expect(row.bet.date).toBeUndefined();
    expect(row.settlements[0]).toMatchObject({ kind: 'Cashout', returned: 500, closedStake: 1000 });
    expect(row.warnings.some((w) => w.includes('Fecha'))).toBe(true);
  });
  it('advierte fechas y estados ambiguos', () => {
    const row = parseCSV('Apuesta,Monto apostado,Cuota,Estado\nA vs B,10,2,Cashout')[0];
    expect(row.warnings.length).toBeGreaterThan(0);
    expect(row.settlements).toHaveLength(0);
  });
  it('exporta y reimporta selecciones y cashout completo', async () => {
    await capital();
    const b = await saved({}, 2);
    await settle(b, 'Cashout', 500);
    const row = parseCSV(exportCSV(await r.snapshot()))[0];
    expect(row.selections).toHaveLength(2);
    expect(row.settlements[0]).toMatchObject({ closedStake: 1000, returned: 500 });
  });
  it('valida respaldo y rechaza un libro contable alterado', async () => {
    await capital();
    await saved();
    const backup = {
      format: 'bettrack',
      version: 1,
      createdAt: timestamp(),
      data: await r.snapshot(),
      images: [],
      settings: await db.settings.get('settings'),
    };
    expect(validateBackup(backup).data.bets).toHaveLength(1);
    backup.data.movements.find((m) => m.kind === 'Apuesta colocada')!.amount = -100;
    expect(() => validateBackup(backup)).toThrow('inconsistente');
  });
  it('deriva estado ganado al liquidar todo el stake', async () => {
    await capital();
    const b = await saved();
    await settle(b, 'Ganada', 2000);
    expect(position(b, await db.settlements.toArray()).status).toBe('Ganada');
  });
});
