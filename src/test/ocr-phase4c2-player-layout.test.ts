import { describe, expect, it, vi } from 'vitest';
import { line } from '../../tests/ocr-phase1/controlled';
import { parseTicket } from '../ocr/parser';
import { completeness, readCapture } from '../ocr/readCapture';
import { interpretMarket } from '../ocr/semantics';
import type { OcrLine } from '../ocr/layout';

// Synthetic coordinates model independently observed OCR layout, not original
// PNGs, protected source captures, or hard-coded output substitutions.
function glyph(text: string, x: number, y: number): OcrLine {
  const row = line(text, x, y);
  row.bbox.y1 = y + 43;
  for (const w of row.words) w.bbox.y1 = y + 43;
  return row;
}

function fourPlayers({ harryOdds = true, alternativeName = false } = {}) {
  const rows = [
    glyph('Betano', 92, 30),
    glyph('Combinada de 4 S/5.00', 86, 252), glyph('6.78', 1038, 252),
    glyph('Kylian Mbappe (Real Madrid)', 176, 380), glyph('1.36', 1012, 380),
    glyph('Anotar en cualquier momento', 174, 469),
    glyph('Real Madrid', 175, 542), glyph('RB Leipzig', 175, 604),
    glyph('Harry Kane (FC Bayern', 176, 743),
    ...(harryOdds ? [glyph('2.30', 1012, 783)] : []),
    glyph('Munchen)', 174, 810),
    glyph('Anotar en cualquier momento', 174, 892),
    glyph('FC Bayern Munchen', 175, 966), glyph('Arsenal FC', 173, 1026),
    glyph('Luis Suárez (Sporting CP)', 176, 1173), glyph('1.40', 1012, 1173),
    glyph('Jugador que anota o da una asistencia', 174, 1262),
    glyph('Sporting CP', 174, 1336), glyph('Linzer ASK', 175, 1397),
    ...(alternativeName
      ? [
          glyph('Nelson Deossa', 176, 1542), glyph('1.55', 1012, 1542),
          glyph('Troy Parrett', 167, 1625),
        ]
      : [
          glyph('Troy Parrott (Real Betis', 173, 1536),
          glyph('1.55', 1012, 1577),
          glyph('Balompié)', 176, 1604),
        ]),
    glyph('Jugador que anota o da una asistencia', 174, 1686),
    glyph('Real Betis Balompié', 175, 1759),
    glyph('Feyenoord Rotterdam', 175, 1820),
    glyph('Apuesta', 86, 1970), glyph('S/5.00', 1000, 1970),
    glyph('Ganancias potenciales', 86, 2090), glyph('S/33.94', 927, 2090),
    ...(!alternativeName ? [glyph('CASH OUT S/3.66', 434, 2208)] : []),
  ];
  return rows;
}

function run(lines: OcrLine[]) {
  return parseTicket('', lines);
}

const raw = (lines: OcrLine[]) => ({
  text: lines.map((x) => x.text).join('\n'), lines, symbols: [], confidence: 90,
});

describe('FASE 4C.2 — read coordinates, retain players, never invent odds', () => {
  it('rebuilds all four real-layout player legs with separate events/markets/odds', () => {
    const parsed = run(fourPlayers());
    expect(parsed.selections).toHaveLength(4);
    expect(parsed.expectedSelections).toBe(4);
    expect(parsed.selections.map((s) => [s.event, s.market, s.pick, s.odds])).toEqual([
      ['Real Madrid vs. RB Leipzig', 'Anotar en cualquier momento',
        'Kylian Mbappe (Real Madrid)', 1.36],
      ['FC Bayern Munchen vs. Arsenal FC', 'Anotar en cualquier momento',
        'Harry Kane (FC Bayern Munchen)', 2.3],
      ['Sporting CP vs. Linzer ASK', 'Jugador que anota o da una asistencia',
        'Luis Suárez (Sporting CP)', 1.4],
      ['Real Betis Balompié vs. Feyenoord Rotterdam',
        'Jugador que anota o da una asistencia',
        'Troy Parrott (Real Betis Balompié)', 1.55],
    ]);
    expect(parsed.interpretations?.map((x) => [
      x.value.statistic, x.value.scope, x.value.participant,
    ])).toEqual([
      ['scorer', 'player', 'Kylian Mbappe'],
      ['scorer', 'player', 'Harry Kane'],
      ['scorer-or-assist', 'player', 'Luis Suárez'],
      ['scorer-or-assist', 'player', 'Troy Parrott'],
    ]);
  });

  it('retains a missing floating odds as null instead of assigning a neighbor badge', () => {
    const parsed = run(fourPlayers({ harryOdds: false }));
    expect(parsed.selections).toHaveLength(4);
    expect(parsed.selections.map((s) => s.odds)).toEqual([1.36, null, 1.4, 1.55]);
    expect(parsed.reviewReasons?.some((reason) => /cuota ausente/.test(reason))).toBe(true);
  });

  it('keeps an alternate unclassified name as review evidence, not a fifth event', () => {
    const parsed = run(fourPlayers({ alternativeName: true }));
    expect(parsed.selections).toHaveLength(4);
    expect(parsed.selections[3]).toMatchObject({
      event: 'Real Betis Balompié vs. Feyenoord Rotterdam',
      pick: 'Nelson Deossa',
      odds: 1.55,
      market: 'Jugador que anota o da una asistencia',
    });
    expect(parsed.reviewReasons?.join(' ')).toContain('Troy Parrett');
    expect(parsed.interpretations?.[3].value).toMatchObject({
      statistic: 'scorer-or-assist',
      scope: 'player', participant: 'Nelson Deossa',
      confidence: { participant: 'review' },
    });
  });

  it('can prefer second OCR pass with a recovered badge without inventing its value', async () => {
    expect(completeness(run(fourPlayers({ harryOdds: false })))).toBe(160);
    const recognize = vi.fn()
      .mockResolvedValueOnce(raw(fourPlayers({ harryOdds: false })))
      .mockResolvedValueOnce(raw(fourPlayers({ harryOdds: true })));
    const parsed = await readCapture(
      { recognize, terminate: vi.fn() },
      new Blob(['synthetic-lines']),
      () => {},
    );
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(parsed.selections).toHaveLength(4);
    expect(parsed.selections.map((s) => s.odds)).toEqual([1.36, 2.3, 1.4, 1.55]);
    expect(recognize.mock.calls[1][3]).toBe(true);
  });

  it.each(['still-missing', 'changed-name', 'changed-known-odds', 'changed-stake', 'lost-leg', 'lost-conflict', 'lost-cashout'])(
    'keeps the first pass when recovery is unsafe: %s', async (change) => {
      const ambiguous = change === 'lost-conflict';
      const first = fourPlayers({ harryOdds: false, alternativeName: ambiguous });
      let second = fourPlayers({ harryOdds: change !== 'still-missing', alternativeName: ambiguous });
      if (change === 'changed-name') second = second.map(row => row.text.startsWith('Kylian')
        ? glyph('Otro Nombre (Real Madrid)', 176, 380) : row);
      if (change === 'changed-known-odds') second = second.map(row => row.text === '1.36'
        ? glyph('1.37', 1012, 380) : row);
      if (change === 'changed-stake') second = second.map(row => row.text === 'S/5.00'
        ? glyph('S/6.00', 1000, 1970) : row);
      if (change === 'lost-leg') second = second.filter(row => row.bbox.y0 < 1170 || row.bbox.y0 > 1450);
      if (change === 'lost-conflict') second = second.filter(row => row.text !== 'Troy Parrett');
      if (change === 'lost-cashout') second = second.filter(row => !row.text.startsWith('CASH OUT'));
      const recognize = vi.fn().mockResolvedValueOnce(raw(first)).mockResolvedValueOnce(raw(second));
      const parsed = await readCapture({ recognize, terminate: vi.fn() }, new Blob(), () => {});
      expect(recognize).toHaveBeenCalledTimes(2);
      expect(parsed).toEqual(run(first));
      expect(parsed.selections[1].odds).toBeNull();
    },
  );

  it('does not reread a complete spatial ticket and reports monotonic progress on recovery', async () => {
    const complete = vi.fn().mockResolvedValue(raw(fourPlayers()));
    await readCapture({ recognize: complete, terminate: vi.fn() }, new Blob(), () => {});
    expect(complete).toHaveBeenCalledTimes(1);
    const progress: number[] = [];
    let pass = 0;
    const recognize = vi.fn(async (_file: Blob, report: (p: number) => void) => {
      [0, 50, 40, 100].forEach(report);
      return raw(fourPlayers({ harryOdds: pass++ > 0 }));
    });
    await readCapture({ recognize, terminate: vi.fn() }, new Blob(), p => progress.push(p));
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(progress.at(-1)).toBe(100);
    expect(progress.every((p, i) => p >= (progress[i - 1] ?? 0) && p <= 100)).toBe(true);
  });

  it.each([
    'Betano\nSimple S/10.00 Perdida',
    'Betano\nSimple S/10.00 Ganada',
    'Betano\nSimple S/10.00 Perdida\nCrear apuesta',
    'Betano\nCrear apuesta',
  ])('a higher completeness score cannot erase safety evidence: %s', async text => {
    const first = { text, lines: [], symbols: [], confidence: 90 };
    expect(completeness(run(fourPlayers()))).toBeGreaterThan(completeness(parseTicket(text)));
    const recognize = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(raw(fourPlayers()));
    const parsed = await readCapture({ recognize, terminate: vi.fn() }, new Blob(), () => {});
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(parsed).toEqual(parseTicket(text));
  });

  it('recognizes a second player in a two-leg ticket without treating his market as an event', () => {
    const lines = [
      glyph('Betano', 90, 40), glyph('Doble S/15.00', 86, 252),
      glyph('2.27', 1038, 252),
      glyph('Harry Kane (FC Bayern', 176, 373),
      glyph('1.88', 1012, 414), glyph('Munchen)', 175, 441),
      glyph('Jugador que anota o da una asistencia', 174, 523),
      glyph('FC Bayern Munchen', 175, 596), glyph('Arsenal FC', 173, 657),
      glyph('2+', 174, 807), glyph('1.21', 1011, 807),
      glyph('Kylian Mbappe Tiros al Arco', 177, 892),
      glyph('Real Madrid', 175, 965), glyph('RB Leipzig', 175, 1027),
      glyph('Apuesta', 86, 1177), glyph('S/15.00', 977, 1177),
      glyph('Ganancias potenciales', 86, 1296), glyph('S/34.12', 927, 1296),
      glyph('CASH OUT S/10.72', 424, 1413),
    ];
    const parsed = run(lines);
    expect(parsed.selections).toHaveLength(2);
    expect(parsed.selections[0]).toMatchObject({
      pick: 'Harry Kane (FC Bayern Munchen)',
      market: 'Jugador que anota o da una asistencia',
      event: 'FC Bayern Munchen vs. Arsenal FC', odds: 1.88,
    });
    expect(parsed.selections[1]).toMatchObject({
      pick: '2+', market: 'Kylian Mbappe Tiros al Arco',
      event: 'Real Madrid vs. RB Leipzig', odds: 1.21,
    });
    expect(parsed.interpretations?.[1].value).toMatchObject({
      // A prefix that differs from both teams is not proof of a player identity.
      // Same contract as Nico Paz and differently accented team names in FASE 2/4A.
      statistic: 'shots-on-target', scope: 'unknown', participant: 'Kylian Mbappe',
      confidence: { scope: 'review', participant: 'review' },
    });
  });

  it('never guesses a player from an unverified club or free-form name', () => {
    const ambiguous = interpretMarket(
      'Anotar en cualquier momento', 'Persona Desconocida (Club Inventado)',
      'Real Madrid vs. RB Leipzig',
    );
    expect(ambiguous.participant).toBeNull();
    expect(ambiguous.scope).toBe('unknown');
  });

  it.each([
    ['FC BAYERN MU\u0308NCHEN', 'player'],
    ['FC   Bayern München', 'player'],
    ['FC Bayern Munchen', 'unknown'],
    ['Bayern München', 'unknown'],
    ['FC Bayern München II', 'unknown'],
  ])('requires exact club identity after NFC/case/space normalization: %s', (club, scope) => {
    const result = interpretMarket('Anotar en cualquier momento', `Harry Kane (${club})`,
      'FC Bayern München vs. Arsenal FC');
    expect(result.scope).toBe(scope);
    expect(result.participant).toBe(scope === 'player' ? 'Harry Kane' : null);
  });

  it('normalizes spaces for a complete team match, never for a partial or accentless identity', () => {
    for (const team of ['FC   Bayern München', 'FC BAYERN MU\u0308NCHEN']) {
      const result = interpretMarket(`${team} Tiros al Arco`, '2+', 'FC Bayern München vs. Arsenal FC');
      expect(result).toMatchObject({ scope: 'team', participant: 'FC Bayern München' });
    }
    for (const team of ['FC Bayern Munchen', 'Bayern München', 'FC Bayern München II']) {
      expect(interpretMarket(`${team} Tiros al Arco`, '2+', 'FC Bayern München vs. Arsenal FC'))
        .toMatchObject({ scope: 'unknown', participant: team, confidence: { participant: 'review' } });
    }
  });
});
