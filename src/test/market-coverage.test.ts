import { describe, expect, it } from 'vitest';
import { parseTicket } from '../ocr/parser';
import { isMarketLine } from '../ocr/markets';
import type { OcrLine } from '../ocr/layout';
import { selectionSchema } from '../domain/model';

// Layout fixtures, not fabricated OCR output presented as real ticket evidence.
// Sources and the distinction from pixel-level validation: docs/OCR_MARKETS.md.
const cases: [string, string][] = [
  ['Resultado final', 'Equipo Norte'],
  ['Ganador del primer tiempo', 'Equipo Norte'],
  ['Ganador del segundo tiempo', 'Equipo Sur'],
  ['Marcador al descanso', '0-0'],
  ['Marcador Correcto al Final del Partido', '2-1'],
  ['Resultado del partido (1X2)', 'X'],
  ['Doble oportunidad', '1X'],
  ['Empate no válido', 'Equipo Norte'],
  ['Clasifica', 'Equipo Sur'],
  ['Hándicap Europeo', '+2'],
  ['Hándicap Asiático - Primer Tiempo', '-0.25'],
  ['Hándicap Asiático', '−0.75'],
  ['Hándicap Asiático', '+0,25'],
  ['Total de goles', '0'],
  ['Goles totales Más/Menos', 'Más de 2.5'],
  ['Goles en Primer Tiempo', 'Menos de 1.5'],
  ['Equipo Norte - Goles totales Más/Menos', 'Más de 0.5'],
  ['Próximo gol antes de 70:00 (Gol 5)', 'Gol antes del minuto 70:00'],
  ['Próximo gol', 'Sin gol'],
  ['Primer equipo en marcar', 'Equipo Norte'],
  ['Equipo que anota el último gol', 'Equipo Sur'],
  ['Anotar en cualquier momento', 'Jugador Norte'],
  ['Jugador que anota o da una asistencia', 'Jugador Norte'],
  ['Ambos equipos anotan', 'Sí'],
  ['Ambos equipos reciben una tarjeta', 'No'],
  ['Córners totales', 'Más de 9.5'],
  ['Equipo Norte - Córners en Primer Tiempo', 'Más de 3.5'],
  ['Tarjetas en los próximos 5 minutos', 'Más de 0.5'],
  ['Saques de banda en los próximos 10 minutos', 'Más de 2.5'],
  ['Jugador Norte Tiros al Arco', '1+'],
  ['Tiros', 'Más de 9.5'],
  ['Tiros a la portería', 'Más de 4.5'],
  ['Remates totales', '4+'],
  ['Pases completados', 'Más de 39.5'],
  ['Faltas recibidas', '2+'],
  ['Fueras de juego', 'Más de 1.5'],
  ['Saques de meta', 'Más de 5.5'],
  ['Quites', '2+'],
  ['Atajadas', '3+'],
  ['Ganador del primer cuarto', 'Equipo Norte'],
  ['Ganador de la primera mitad', 'Equipo Sur'],
  ['Cuarto con más puntos', '2'],
  ['Total de Puntos Más/Menos', 'Más de 220.5'],
  ['Jugador Norte - Puntos + Rebotes + Asistencias', 'Más de 30.5'],
  ['Ganador (incluye prórroga)', 'Equipo Norte'],
  ['Ganador del set actual', 'Jugador Norte'],
  ['Ganador del siguiente set', 'Jugador Sur'],
  ['Ganador del primer set', 'Jugador Norte'],
  ['Ganador del 2º set', 'Jugador Sur'],
  ['Total del Set Más/Menos', 'Más de 9.5'],
  ['Total de juegos', 'Más de 22.5'],
  ['Marcador del Juego', '40:30'],
  ['Tie-break en el set', 'Sí'],
  ['Aces', 'Más de 5.5'],
  ['Dobles faltas', 'Menos de 3.5'],
  ['Resultado al Final del Tiempo Reglamentario', 'Equipo Norte'],
  ['Total de Goles al Final del Tiempo Reglamentario', 'Más de 5.5'],
  ['Total de Carreras', 'Más de 8.5'],
  ['Total de asaltos', 'Más de 2.5'],
  ['Método de victoria', 'KO/TKO'],
  ['Ganador', 'Equipo Norte'],
  ['Goleador', 'Jugador Norte'],
  ['Goleadores', 'Jugador Norte'],
  ['Marcará en cualquier momento', 'Jugador Norte'],
  ['Amonestación', 'Jugador Norte'],
  ['Amonestaciones', 'Jugador Norte'],
  ['Expulsión', 'Sí'],
  ['Expulsiones', 'Más de 0.5'],
  ['Penal en el partido', 'Sí'],
  ['Penales', 'Más de 0.5'],
  ['Ganador del mapa', 'Equipo Norte'],
  ['Ganador de la ronda de pistola', 'Equipo Norte'],
  ['Total de mapas jugados', 'Más de 2.5'],
  ['Total de rondas por equipo', 'Más de 12.5'],
  ['Par o impar de rondas', 'Par'],
  ['Par/Impar', 'Impar'],
  ['Primer equipo en alcanzar 5 rondas', 'Equipo Norte'],
  ['Si habrá tiempo extra', 'Sí'],
  ['Duelos entre jugadores (empate sin apuesta)', 'Jugador Norte'],
];

function line(text: string, x: number, y: number): OcrLine {
  let at = x;
  const words = text.split(' ').map((text) => {
    const x0 = at;
    at += text.length * 7 + 7;
    return { text, confidence: 95, bbox: { x0, x1: at - 7, y0: y, y1: y + 20 } };
  });
  return { text, confidence: 95, bbox: { x0: x, x1: at, y0: y, y1: y + 20 }, words };
}

function ticket(market: string[], pick: string, builder = false) {
  const entries = builder
    ? [
        'Bet Builder',
        'Equipo Norte',
        'Equipo Sur',
        `O ${pick}`,
        ...market,
        'O Sí',
        'Ambos equipos anotan',
      ]
    : [pick, ...market, 'Equipo Norte', 'Equipo Sur'];
  return parseTicket('', [
    line('Betano', 90, 10),
    line('Simple S/10.00', 80, 70),
    line('2.00', 900, 73),
    ...entries.map((text, i) => line(text, 160, 150 + i * 40)),
    line('2.00', 900, 153),
    line('Apuesta', 80, 700),
    line('S/10.00', 900, 703),
    line('Ganancias potenciales', 80, 750),
    line('S/20.00', 900, 753),
    line('CASH OUT S/8.90', 350, 800),
  ]);
}

describe('Market coverage through the Betano layout parser', () => {
  it.each(cases)('preserves %s with pick %s in a simple and a Builder', (market, pick) => {
    for (const builder of [false, true]) {
      const p = ticket([market], pick, builder);
      expect(p).toMatchObject({
        house: 'Betano',
        stake: 1000,
        odds: 2,
        potential: 2000,
        cashoutOffer: 890,
      });
      expect(p.selections).toHaveLength(1);
      const selection = p.selections[0];
      expect(selection.event).toBe('Equipo Norte vs. Equipo Sur');
      expect(selectionSchema.safeParse({ ...selection, id: 'test', betId: 'test' }).success).toBe(
        true,
      );
      if (builder)
        expect(selection.builderMarkets).toEqual([
          { market, pick },
          { market: 'Ambos equipos anotan', pick: 'Sí' },
        ]);
      else expect(selection).toMatchObject({ market, pick });
      expect(p.visibleStatus).toBeUndefined();
      expect(p).not.toHaveProperty('settlements');
    }
  });

  it.each([
    ['Goles totales', 'en Primer Tiempo'],
    ['Total de puntos', '(incluye prórroga)'],
    ['Tiros al arco', '(80:00–90:00)'],
    ['Ganador', 'del segundo set'],
  ])('retains a wrapped qualifier: %s / %s', (market, qualifier) => {
    for (const builder of [false, true]) {
      const p = ticket([market, qualifier], 'Más de 2.5', builder);
      const s = p.selections[0];
      expect(s.event).toBe('Equipo Norte vs. Equipo Sur');
      expect(builder ? s.builderMarkets?.[0].market : s.market).toBe(`${market} ${qualifier}`);
      if (builder) expect(s.builderMarkets).toHaveLength(2);
    }
  });

  it.each(['Mercado desconocido', 'Primer Tiempo', 'sin prórroga'])(
    'does not invent a market for %s',
    (market) => {
      const p = ticket([market], 'Más de 2.5');
      expect(p.selections[0].market).toBe('');
      expect(
        selectionSchema.safeParse({ ...p.selections[0], id: 'test', betId: 'test' }).success,
      ).toBe(false);
      expect(p.warnings.some((w) => w.includes('incompleto'))).toBe(true);
    },
  );

  it.each([
    'Gol Gohar FC',
    'River Plate',
    'Los Ganadores FC',
    'Total Soccer FC',
    'Carlos Alcaraz',
    'Los Angeles Lakers',
    'Minnesota Twins',
    'Team Liquid',
    'Resultado FC',
    'Marcador FC',
    'Carreras FC',
    'Setubal',
    'Jugador Norte (Equipo Norte)',
    'Primer Tiempo FC',
    'Ganador Unido',
    'Ganador del Torneo FC',
  ])('does not consume a participant name as a market: %s', (name) => {
    expect(isMarketLine(name)).toBe(false);
  });
});
