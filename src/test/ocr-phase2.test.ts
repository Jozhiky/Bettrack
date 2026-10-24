import { describe, it, expect, vi } from 'vitest';
import { line, layoutProbe } from '../../tests/ocr-phase1/controlled';
import { parseTicket } from '../ocr/parser';
import { interpretMarket } from '../ocr/semantics';
import { isMarketLine } from '../ocr/markets';
import { BettrackDB } from '../data/db';
import { LocalRepository } from '../data/repository';
import { registerCapture } from './confirm-ready-capture';
import { position } from '../domain/model';

vi.mock('../integrations/supabase', () => ({
  supabase: new Proxy(
    {},
    {
      get() {
        throw new Error('External access forbidden in phase 2');
      },
    },
  ),
}));

// Independent layout oracle, not a claim of pixel-level NBA coverage.
function threeLegs(missing: number[]) {
  return [
    line('Betano', 90, 10),
    line('Combinada de 3 S/10.00', 80, 70),
    line('8.00', 900, 73),
    ...[0, 1, 2].flatMap((i) => [
      line('Más de 2.5', 160, 150 + i * 300),
      ...(!missing.includes(i) ? [line('2.00', 900, 153 + i * 300)] : []),
      line('Goles totales Más/Menos', 160, 190 + i * 300),
      line(`Club Norte ${i}`, 160, 230 + i * 300),
      line(`Club Sur ${i}`, 160, 270 + i * 300),
    ]),
    line('Apuesta S/10.00', 80, 1100),
    line('Ganancias potenciales S/80.00', 80, 1150),
  ];
}

describe('Phase 2 reconstruction: preserve evidence and roles', () => {
  it.each([{ missing: [0] }, { missing: [1] }, { missing: [2] }, { missing: [0, 1, 2] }])(
    'keeps all three legs with missing badges $missing',
    ({ missing }) => {
      const p = parseTicket('', threeLegs(missing));
      expect(p.selections).toHaveLength(3);
      p.selections.forEach((s, i) => {
        expect(s.event).toBe(`Club Norte ${i} vs. Club Sur ${i}`);
        expect(s.odds).toBe(missing.includes(i) ? null : 2);
        if (missing.includes(i)) expect(p.confidence[`selections[${i}].odds`]).toBe('missing');
      });
      expect(p.reviewReasons).toHaveLength(missing.length);
    },
  );

  it('does not turn an unknown team-prefixed label into a participant or another pick', () => {
    const market = 'Equipo Norte - Mercado no catalogado';
    const p = parseTicket('', layoutProbe({ market, builder: true }).lines);
    expect(p.selections[0].event).toBe('Equipo Norte vs. Equipo Sur');
    expect(p.selections[0].builderMarkets).toEqual([
      { market, pick: 'Más de 2.5' },
      { market: 'Ambos equipos anotan', pick: 'Sí' },
    ]);
    expect(p.interpretations?.[0].value.family).toBeNull();
    expect(p.interpretations?.[0].value.scope).toBe('unknown');
    expect(p.reviewReasons?.length).toBeGreaterThan(0);
  });

  it('preserves a participant containing a market word and asks for identity review', () => {
    const source = layoutProbe().lines.map((r) =>
      r.text === 'Equipo Norte' ? line('Córners FC', 160, r.bbox.y0) : r,
    );
    const p = parseTicket('', source);
    expect(p.selections[0]).toMatchObject({
      market: 'Goles totales Más/Menos',
      event: 'Córners FC vs. Equipo Sur',
    });
    expect(p.reviewReasons?.join(' ')).toContain('identidad');
  });

  it('cannot invent the missing event participant', () => {
    const source = layoutProbe({ market: 'Mercado desconocido' }).lines.filter(
      (r) => r.text !== 'Equipo Sur',
    );
    const p = parseTicket('', source);
    expect(p.selections).toHaveLength(2);
    expect(p.selections[0].event).toBe('');
    expect(p.text).toContain('Mercado desconocido');
    expect(p.confidence['selections[0].event']).toBe('missing');
  });

  it('does not split indented builder children when their bullet was not read', () => {
    const source = layoutProbe({ builder: true }).lines.map((r) =>
      r.text === 'O Sí' ? line('Sí', 230, r.bbox.y0 + 20) : r,
    );
    const p = parseTicket('', source);
    expect(p.selections).toHaveLength(2);
    expect(p.selections[0].builderMarkets).toHaveLength(2);
  });
  it('keeps a Builder and its children when its external odds badge is absent', () => {
    const p = parseTicket('', layoutProbe({ builder: true, missingOdds: true }).lines);
    expect(p.selections).toHaveLength(2);
    expect(p.selections[0].odds).toBeNull();
    expect(p.selections[0].builderMarkets).toHaveLength(2);
    expect(p.confidence['selections[0].odds']).toBe('missing');
  });
  it('does not lose a quoted outer pick containing a market keyword', () => {
    const p = parseTicket(
      '',
      layoutProbe().lines.map((r) =>
        r.text === 'Más de 1.5' ? line('Córners FC', 160, r.bbox.y0) : r,
      ),
    );
    expect(p.selections).toHaveLength(2);
    expect(p.selections[1].pick).toBe('Córners FC');
    expect(p.selections[1].odds).toBe(2);
  });
  it('uses an explicit Builder bullet before vocabulary to identify a pick', () => {
    const source = layoutProbe({ builder: true }).lines.map((r) =>
      r.text === 'O Sí' ? line('O Córners FC', 160, r.bbox.y0) : r,
    );
    const p = parseTicket('', source);
    expect(p.selections[0].builderMarkets).toEqual([
      { pick: 'Más de 2.5', market: 'Goles totales Más/Menos' },
      { pick: 'Córners FC', market: 'Ambos equipos anotan' },
    ]);
  });
});

describe('Phase 2 semantics: explicit attributes, no silent text replacement', () => {
  it.each([
    ['Goles totales Más/Menos', 'goals', 'match', 'unspecified'],
    ['Goles totales del partido completo', 'goals', 'match', 'full-match'],
    ['Goles totales en Primer Tiempo', 'goals', 'match', 'first-half'],
    ['Equipo Norte - Goles totales Más/Menos', 'goals', 'team', 'unspecified'],
    ['Remates totales', 'shots', 'match', 'unspecified'],
    ['Remates al arco', 'shots-on-target', 'match', 'unspecified'],
    ['Tiros a la portería', 'shots-on-target', 'match', 'unspecified'],
    ['Córners totales', 'corners', 'match', 'unspecified'],
    ['Equipo Norte - Córners en Primer Tiempo', 'corners', 'team', 'first-half'],
    ['Jugador Norte Tiros al Arco', 'shots-on-target', 'player', 'unspecified'],
    ['Jugador Norte Atajadas', 'saves', 'player', 'unspecified'],
    ['Jugador Norte Asistencias', 'assists', 'player', 'unspecified'],
    ['Próximo gol antes de 70:00 (Gol 5)', 'next-goal', 'match', 'unspecified'],
    ['Puntos en Primer Período', 'points', 'match', 'first-period'],
  ])('%s preserves statistic, scope and period', (market, statistic, scope, period) => {
    const p = interpretMarket(market, 'Más de 2.5', 'Equipo Norte vs. Equipo Sur');
    expect(p).toMatchObject({ statistic, scope, period, operator: 'over', threshold: 2.5 });
    expect(p.original.market).toBe(market);
    expect(p.sport).toBeNull();
  });

  it.each([
    'CÓRNERS EN PRIMER TIEMPO MÁS/MENOS',
    'corners en primer tiempo mas/menos',
    'Co\u0301rners en Primer Tiempo Ma\u0301s/Menos',
  ])('tolerates accent/case/composition variants without editing %s', (market) => {
    expect(isMarketLine(market)).toBe(true);
    const p = interpretMarket(market, 'Ma\u0301s de 4,5');
    expect(p).toMatchObject({
      statistic: 'corners',
      period: 'first-half',
      operator: 'over',
      threshold: 4.5,
    });
    expect(p.original).toMatchObject({ market, pick: 'Ma\u0301s de 4,5' });
  });
  it('handles NBA first period without relabelling it as football first half', () => {
    const p = interpretMarket(
      'Puntos en Primer Período',
      'Más de 50.5',
      'Los Angeles Lakers vs. Boston Celtics',
      'Baloncesto',
    );
    expect(p).toMatchObject({
      sport: 'Baloncesto',
      statistic: 'points',
      period: 'first-period',
      threshold: 50.5,
    });
    const ticket = parseTicket('', layoutProbe({ market: 'Puntos en Primer Período' }).lines);
    expect(ticket.selections[0].market).toBe('Puntos en Primer Período');
    expect(ticket.interpretations?.[0].value.period).toBe('first-period');
  });
  it('never merges distinct team/player identities through diacritic folding or a substring', () => {
    for (const name of ['Bayern München', 'Bayern Munchen', 'Bayer München', 'Bayern München II']) {
      const market = `${name} Tiros al Arco`;
      const p = interpretMarket(market, '1+', 'Bayern München vs. Arsenal FC');
      expect(p.original.market).toBe(market);
      expect(p.participant).toBe(name);
      expect(p.scope).toBe(name === 'Bayern München' ? 'team' : 'unknown');
    }
    const ambiguous = interpretMarket(
      'Nico Paz Tiros al Arco',
      '1+',
      'Como 1907 vs. Manchester United',
    );
    expect(ambiguous.scope).toBe('unknown'); // no player roster supplied
    expect(ambiguous.participant).toBe('Nico Paz');
    expect(ambiguous.confidence.participant).toBe('review');
  });
  it('does not label a tennis event participant as a team when sport is explicit', () => {
    expect(
      interpretMarket(
        'Carlos Alcaraz Puntos',
        'Más de 30.5',
        'Carlos Alcaraz vs. Jannik Sinner',
        'Tenis',
      ),
    ).toMatchObject({ scope: 'player', participant: 'Carlos Alcaraz' });
  });
  it.each([
    'Goles de Club Desconocido',
    'Remates totales de Nico Paz',
    'Córners especiales',
    'Atajadas',
  ])('does not silently default an unresolved qualifier to match scope: %s', (market) => {
    expect(interpretMarket(market, 'Más de 2.5').scope).toBe('unknown');
  });
  it('recognizes an explicit team suffix without accepting a partial name', () => {
    expect(
      interpretMarket('Goles de Equipo Norte', 'Más de 1.5', 'Equipo Norte vs. Equipo Sur').scope,
    ).toBe('team');
    expect(
      interpretMarket('Goles de Equipo', 'Más de 1.5', 'Equipo Norte vs. Equipo Sur').scope,
    ).toBe('unknown');
  });
  it('does not flatten a goals handicap into a goals total', () => {
    expect(interpretMarket('Hándicap de goles', 'Equipo Norte -1.5')).toMatchObject({
      statistic: 'handicap',
      operator: 'handicap',
      threshold: -1.5,
    });
  });
  it.each([
    ['Sí', 'yes', null],
    ['Si', 'yes', null],
    ['No', 'no', null],
    ['1+', 'at-least', 1],
    ['1', null, null],
    ['Menos de 2,5', 'under', 2.5],
  ])('keeps operator evidence for %s', (pick, operator, threshold) => {
    expect(interpretMarket('Tiros al Arco', String(pick))).toMatchObject({ operator, threshold });
  });
  it.each(['+3', '-3', '−0.75'])(
    'preserves handicap sign %s without treating it as a total',
    (pick) => {
      expect(interpretMarket('Hándicap Asiático', `Equipo Norte ${pick}`)).toMatchObject({
        statistic: 'handicap',
        operator: 'handicap',
        threshold: Number(pick.replace('−', '-')),
      });
    },
  );
  it('preserves unknown text and time/ordinal qualifiers rather than guessing attributes', () => {
    const market = 'Mercado experimental del jugador en quinto período';
    expect(interpretMarket(market, 'Algo')).toMatchObject({
      family: null,
      statistic: null,
      scope: 'unknown',
      period: 'unspecified',
      original: { market, pick: 'Algo' },
      confidence: { market: 'review' },
    });
    const p = interpretMarket('Próximo gol antes de 70:00 (Gol 5)', 'Gol antes del minuto 70:00');
    expect(p.original.market).toContain('70:00 (Gol 5)');
    expect(p.threshold).toBeNull(); // minute and goal ordinal are not a goal total
  });
});

describe('Phase 2 registration safety, isolated database only', () => {
  it.each(['Pendiente', 'Ganada', 'Perdida', 'Cashout ejecutado'])(
    'visible %s requires explicit settlement',
    async (status) => {
      const db = new BettrackDB(`phase2-${crypto.randomUUID()}`);
      try {
        const repository = new LocalRepository(db);
        await repository.init();
        const p = parseTicket('', [...layoutProbe().lines, line(status, 160, 950)]);
        expect(p.visibleStatus).toBe(status);
        expect(p.cashoutOffer).toBe(890);
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
        await registerCapture('upload', p, repository);
        const bet = (await db.bets.get('upload'))!;
        expect(position(bet, []).status).toBe('Pendiente');
        expect(await db.settlements.count()).toBe(0);
        if (status !== 'Pendiente') {
          const kind =
            status === 'Cashout ejecutado' ? 'Cashout' : (status as 'Ganada' | 'Perdida');
          await repository.settle({
            id: 'settlement',
            betId: bet.id,
            date: bet.date,
            kind,
            closedStake: bet.stake,
            returned: kind === 'Perdida' ? 0 : kind === 'Cashout' ? 500 : 4000,
            note: '',
          });
          expect(position(bet, await db.settlements.toArray()).status).toBe(kind);
        }
      } finally {
        await db.delete();
      }
    },
  );
});
