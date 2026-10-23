import { describe, it, expect, vi } from 'vitest';
import { layoutProbe } from '../../tests/ocr-phase1/controlled';
import { parseTicket, type ParsedTicket } from '../ocr/parser';
import { interpretMarket } from '../ocr/semantics';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture } from '../data/captures';

vi.mock('../integrations/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error('External access forbidden in phase 2.1');
      },
    },
  ),
}));

// Controlled evidence, not screenshots or a claim of bookmaker catalogue coverage.
const ambiguous = [
  'Córners de Equipo en Primer Tiempo',
  'Goles de Equipo',
  'Nico Paz Remates totales',
  'Nico Paz Remates al arco',
  'Puntos de Equipo en Primer Período',
  'Goles del equipo',
  'Remates del jugador',
] as const;

async function registration(parsed: ParsedTicket) {
  const db = new BettrackDB(`phase21-${crypto.randomUUID()}`);
  try {
    const repository = new LocalRepository(db);
    await repository.init();
    await db.images.add({
      id: 'image',
      hash: 'fixture',
      name: 'fixture',
      blob: new Blob(['fixture']),
    });
    await db.uploads.add({
      id: 'upload',
      imageId: 'image',
      status: 'queued',
      progress: 0,
      createdAt: '2026-01-01T12:00:00.000Z',
      draftJson: '',
      reason: '',
    });
    await registerCapture('upload', parsed, repository);
    return {
      upload: await db.uploads.get('upload'),
      bets: await db.bets.count(),
      movements: await db.movements.count(),
      settlements: await db.settlements.count(),
    };
  } finally {
    await db.delete();
  }
}

describe('Phase 2.1 semantic confidence reaches the automatic registration boundary', () => {
  it.each(ambiguous)('retains and reviews ambiguous scope/identity: %s', async (market) => {
    const parsed = parseTicket('', layoutProbe({ market }).lines);
    expect(parsed.selections[0].market).toBe(market);
    const meaning = parsed.interpretations![0].value;
    expect(meaning.scope === 'unknown' || meaning.participant === null).toBe(true);
    const result = await registration(parsed);
    expect(result.upload?.status).toBe('review');
    expect(result).toMatchObject({ bets: 0, movements: 0, settlements: 0 });
    expect(parsed.reviewReasons?.length).toBeGreaterThan(0);
    expect(JSON.parse(result.upload!.draftJson).selections).toEqual(parsed.selections);
  });

  it('does not trust missing/stale review metadata in a Builder draft', async () => {
    const parsed = parseTicket(
      '',
      layoutProbe({ market: 'Nico Paz Tiros al Arco', builder: true }).lines,
    );
    parsed.reviewReasons = [];
    parsed.interpretations = [];
    parsed.confidence = { market: 'high' };
    const result = await registration(parsed);
    expect(result.upload?.status).toBe('review');
    expect(result).toMatchObject({ bets: 0, movements: 0, settlements: 0 });
    expect(result.upload?.reason).toContain('builderMarkets[0]');
  });

  it.each([
    ['Equipo Norte - Córners en Primer Tiempo', 'team', 'corners', 'first-half'],
    ['Equipo Norte - Goles totales', 'team', 'goals', 'unspecified'],
    ['Goles totales Más/Menos', 'match', 'goals', 'unspecified'],
    ['Remates totales', 'match', 'shots', 'unspecified'],
    ['Remates al arco', 'match', 'shots-on-target', 'unspecified'],
    ['Equipo Norte - Puntos en Primer Período', 'team', 'points', 'first-period'],
    ['Puntos en Primer Período', 'match', 'points', 'first-period'],
    ['Hándicap Asiático', 'unknown', 'handicap', 'unspecified'],
  ])('does not blanket-block optional attributes: %s', async (market, scope, statistic, period) => {
    const parsed = parseTicket('', layoutProbe({ market }).lines);
    const meaning = parsed.interpretations![0].value;
    expect(meaning).toMatchObject({ scope, statistic, period });
    expect(parsed.confidence.stake).toBe('review'); // coarse OCR confidence alone is not a veto
    const result = await registration(parsed);
    expect(result.upload?.status).toBe('saved');
    expect(result).toMatchObject({ bets: 1, movements: 1, settlements: 0 });
  });

  it('preserves NBA evidence and distinguishes period from football half', () => {
    const p = interpretMarket(
      'Equipo Norte - Puntos en Primer Período',
      'Más de 25.5',
      'Equipo Norte vs. Equipo Sur',
      'Baloncesto',
    );
    expect(p).toMatchObject({
      scope: 'team',
      participant: 'Equipo Norte',
      sport: 'Baloncesto',
      statistic: 'points',
      period: 'first-period',
      threshold: 25.5,
    });
  });

  it('does not let a differently accented identity inherit team confidence', async () => {
    const parsed = parseTicket('', layoutProbe({ market: 'Equipo Nórte - Goles totales' }).lines);
    expect(parsed.interpretations![0].value.confidence.participant).toBe('review');
    expect((await registration(parsed)).upload?.status).toBe('review');
  });

  it('keeps explicit team Builder markets eligible despite optional missing sport/period', async () => {
    const parsed = parseTicket(
      '',
      layoutProbe({ market: 'Equipo Norte - Goles totales', builder: true }).lines,
    );
    expect(parsed.interpretations![0].value.confidence).toMatchObject({
      sport: 'missing',
      period: 'missing',
    });
    expect((await registration(parsed)).upload?.status).toBe('saved');
  });

  it('protects saved history even if a later reading becomes semantically ambiguous', async () => {
    const db = new BettrackDB(`phase21-history-${crypto.randomUUID()}`);
    try {
      const repository = new LocalRepository(db);
      await repository.init();
      await db.images.add({
        id: 'image',
        hash: 'fixture',
        name: 'fixture',
        blob: new Blob(['fixture']),
      });
      await db.uploads.add({
        id: 'upload',
        imageId: 'image',
        status: 'queued',
        progress: 0,
        createdAt: '2026-01-01T12:00:00.000Z',
        draftJson: '',
        reason: '',
      });
      await registerCapture('upload', parseTicket('', layoutProbe().lines), repository);
      const before = await repository.snapshot();
      const draft = parseTicket('', layoutProbe({ market: 'Goles de Equipo' }).lines);
      draft.reviewReasons = []; // exercise the new boundary, not a caller-supplied warning
      await registerCapture('upload', draft, repository);
      await db.uploads.add({
        id: 'new-upload',
        imageId: 'image',
        status: 'queued',
        progress: 0,
        createdAt: '2026-01-02T12:00:00.000Z',
        draftJson: '',
        reason: '',
      });
      await registerCapture('new-upload', draft, repository);
      expect((await db.uploads.get('upload'))?.status).toBe('saved');
      expect((await db.uploads.get('new-upload'))?.status).toBe('review');
      const after = await repository.snapshot();
      for (const key of [
        'bets',
        'selections',
        'movements',
        'settlements',
        'houses',
        'audit',
      ] as const)
        expect(after[key]).toEqual(before[key]);
    } finally {
      await db.delete();
    }
  });
});

describe('Phase 2.1 Cerrar apuesta is contextual, never proof of settlement', () => {
  it.each([
    'Crear apuesta\nCerrar apuesta S/10.00',
    'Confirmar apuesta\nCerrar apuesta S/10.00',
    'Cerrar apuesta S/10.00',
    'Cobrar S/10.00',
    'Crear apuesta\nCashout disponible\nCerrar apuesta S/10.00',
  ])('does not infer an offer from a creation or ambiguous action: %s', (footer) => {
    const parsed = parseTicket(`Betano\nSimple S/10.00 2.00\n${footer}`);
    expect(parsed.cashoutOffer).toBeUndefined();
    expect(parsed.text).toContain(footer);
    expect(parsed.warnings.join(' ')).not.toContain('Cashout visible');
  });

  it.each([
    'CASH OUT S/8.90',
    'Cashout disponible S/8.90',
    'Cashout disponible\nCerrar apuesta S/8.90',
    'Cashout disponible\nCobrar S/8.90',
  ])('keeps an explicitly available cashout: %s', (footer) => {
    const parsed = parseTicket(`Betano\nMis apuestas\n${footer}`);
    expect(parsed.cashoutOffer).toBe(890);
    expect(parsed.visibleStatus).toBeUndefined();
  });

  it('does not borrow a distant availability label for an unrelated action', () => {
    const p = parseTicket(
      'Betano\nCashout disponible\nMi cuenta\nMovimientos\nConfirmación\nCerrar apuesta S/10.00',
    );
    expect(p.cashoutOffer).toBeUndefined();
  });

  it('does not relabel executed cashout as an available offer', () => {
    const parsed = parseTicket('Betano\nCashout ejecutado\nCobrar S/8.90');
    expect(parsed.visibleStatus).toBe('Cashout ejecutado');
    expect(parsed.cashoutOffer).toBeUndefined();
  });
});
