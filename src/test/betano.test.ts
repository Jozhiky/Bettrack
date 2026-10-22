import { describe, expect, it } from 'vitest';
import { parseTicket } from '../ocr/parser';
import { visualRows, type OcrLine } from '../ocr/layout';
import { fingerprint, selectionSchema } from '../domain/model';

function line(text: string, x: number, y: number): OcrLine {
  const bbox = { x0: x, y0: y, x1: x + text.length * 7, y1: y + 20 };
  let at = x;
  const words = text.split(' ').map((text) => {
    const x0 = at;
    at += text.length * 7 + 7;
    return { text, confidence: 95, bbox: { x0, y0: y, x1: at - 7, y1: y + 20 } };
  });
  return { text, confidence: 95, bbox, words };
}
const header = [
  line('Betano', 90, 10),
  line('Combinada de 2 S/1.50', 80, 80),
  line('46.00', 900, 83),
];
const body = [
  line('Más de 0.5', 160, 150),
  line('1.11', 900, 153),
  line('Equipo Azul - Goles totales Más/Menos', 160, 190),
  line('Equipo Rojo', 160, 230),
  line('Equipo Azul', 160, 270),
  line('0', 950, 230),
  line('Bet Builder', 160, 330),
  line('1.31', 900, 333),
  line('Equipo Norte', 160, 370),
  line('Equipo Sur', 160, 410),
  line('Hoy 14:00', 820, 390),
  line('O Más de 0.5', 160, 470),
  line('Goles en Primer Tiempo', 210, 510),
  line('O Sí', 160, 570),
  line('Ambos equipos reciben una tarjeta', 210, 610),
];
const footer = [
  line('Apuesta', 80, 690),
  line('S/1.50', 900, 693),
  line('Ganancias potenciales', 80, 740),
  line('S/69.01', 900, 743),
  line('CASH OUT S/0.76', 350, 800),
];
const geometry = [...header, ...body, ...footer];
describe('Betano: lectura espacial y grupos', () => {
  it.each([
    ['60:00', 2.22, '22.20'],
    ['70:00', 1.6, '16.00'],
  ] as const)(
    'preserva el próximo gol antes de %s, el ordinal y los equipos',
    (minute, odds, potential) => {
      const p = parseTicket('', [
        line('Betano', 90, 10),
        line('Simple S/10.00', 80, 80),
        line(odds.toFixed(2), 900, 83),
        line(`Gol antes del minuto ${minute}`, 160, 150),
        line(odds.toFixed(2), 900, 153),
        line(`Próximo gol antes de ${minute} (Gol 5)`, 160, 190),
        line('Lille OSC', 160, 230),
        line('2', 950, 230),
        line('4', 760, 250), // OCR of the live lightning icon, not a numeric pick.
        line('45:00', 830, 250),
        line('Galatasaray SK', 160, 270),
        line('2', 950, 270),
        line('Apuesta', 80, 330),
        line('S/10.00', 900, 333),
        line('Ganancias potenciales', 80, 370),
        line(`S/${potential}`, 900, 373),
        line('CASH OUT S/8.90', 350, 420),
      ]);
      expect(p).toMatchObject({ house: 'Betano', kind: 'Simple', stake: 1000, odds });
      expect(p.selections).toEqual([
        expect.objectContaining({
          event: 'Lille OSC vs. Galatasaray SK',
          market: `Próximo gol antes de ${minute} (Gol 5)`,
          pick: `Gol antes del minuto ${minute}`,
          odds,
        }),
      ]);
      expect(
        selectionSchema.safeParse({ ...p.selections[0], id: 'test', betId: 'test' }).success,
      ).toBe(true);
      expect(p).not.toHaveProperty('settlements');
    },
  );
  it('joins a wrapped player qualifier and keeps a scorer market separate from shots', () => {
    const p = parseTicket('', [
      ...header,
      ...body.slice(0, 8),
      line('Equipo Norte', 160, 370),
      line('Equipo Sur', 160, 410),
      line('O Ousmane Dembélé (Paris Saint-', 160, 450),
      line('Germain)', 180, 480),
      line('Jugador que anota o da una asistencia', 180, 510),
      line('O 4+', 160, 560),
      line('Ousmane Dembélé Tiros al Arco', 180, 600),
      ...footer,
    ]);
    expect(p.selections[1].builderMarkets).toEqual([
      {
        pick: 'Ousmane Dembélé (Paris Saint-Germain)',
        market: 'Jugador que anota o da una asistencia',
      },
      { pick: '4+', market: 'Ousmane Dembélé Tiros al Arco' },
    ]);
  });
  it('keeps a leg payment notice out of the event without settling the ticket', () => {
    const p = parseTicket('', [...geometry, line('Ganado con Pago Anticipado', 160, 300)]);
    expect(p.selections[0].event).toBe('Equipo Rojo vs. Equipo Azul');
    expect(p.warnings.some((w) => w.includes('no liquida el boleto completo'))).toBe(true);
    expect(p.visibleStatus).toBeUndefined();
  });
  it('preserves team, period and unusual Asian line text separately', () => {
    const p = parseTicket(
      '',
      geometry.map((r) =>
        r.text === 'Goles en Primer Tiempo'
          ? line('Equipo Norte - Saques de banda en Primer Tiempo', 210, 510)
          : r.text === 'O Más de 0.5'
            ? line('O Más de 7.25', 160, 470)
            : r,
      ),
    );
    expect(p.selections[1].builderMarkets?.[0]).toEqual({
      pick: 'Más de 7.25',
      market: 'Equipo Norte - Saques de banda en Primer Tiempo',
    });
  });
  it('reconoce Clasifica como mercado, conservando equipos y selección', () => {
    const p = parseTicket('', [
      line('Betano', 90, 10),
      line('Simple S/35.00', 80, 80),
      line('1.35', 900, 83),
      line('Vasco da Gama RJ', 160, 150),
      line('1.35', 900, 153),
      line('Clasifica', 160, 190),
      line('Vasco da Gama RJ', 160, 230),
      line('Boca Juniors', 160, 270),
      line('Hoy 19:30', 820, 250),
      ...footer,
    ]);
    expect(p.selections).toHaveLength(1);
    expect(p.selections[0]).toMatchObject({
      event: 'Vasco da Gama RJ vs. Boca Juniors',
      market: 'Clasifica',
      pick: 'Vasco da Gama RJ',
      odds: 1.35,
    });
    expect(selectionSchema.safeParse({ ...p.selections[0], id: 's', betId: 'b' }).success).toBe(
      true,
    );
  });
  it('conserva Clasifica dentro de un Bet Builder sin confundirlo con un pick', () => {
    const p = parseTicket(
      '',
      geometry.map((r) =>
        r.text === 'Goles en Primer Tiempo'
          ? line('Clasifica', 210, 510)
          : r.text === 'O Más de 0.5'
            ? line('O Equipo Norte', 160, 470)
            : r,
      ),
    );
    expect(p.selections[1].builderMarkets).toEqual([
      { pick: 'Equipo Norte', market: 'Clasifica' },
      { pick: 'Sí', market: 'Ambos equipos reciben una tarjeta' },
    ]);
  });
  it('excluye Manana sin tilde entre equipos, también en Bet Builder', () => {
    const p = parseTicket('', [
      ...geometry,
      line('Manana 14:00', 710, 250),
      line('Manana 14:00', 710, 390),
    ]);
    expect(p.selections[0].event).toBe('Equipo Rojo vs. Equipo Azul');
    expect(p.selections[1].event).toBe('Equipo Norte vs. Equipo Sur');
    expect(p.selections[1].builderMarkets).toHaveLength(2);
    expect(
      p.selections.every((s) => selectionSchema.safeParse({ ...s, id: 's', betId: 'b' }).success),
    ).toBe(true);
    expect(p).not.toHaveProperty('date');
  });
  it.each([
    'Esta noche 20:00',
    'Esta nocte 20:00',
    'Esta noc*e 20:20',
    'Esta tarde 16:00',
    'Esta mañana 09:00',
  ])('excluye el horario derecho %s sin crear otro equipo', (schedule) => {
    for (const y of [230, 250]) {
      const p = parseTicket('', [
        ...geometry.filter((r) => r.text !== 'Hoy 14:00' && r.text !== '0'),
        line(schedule, 710, y),
        line(schedule, 710, y + 140),
      ]);
      expect(p.selections[0].event).toBe('Equipo Rojo vs. Equipo Azul');
      expect(p.selections[1].event).toBe('Equipo Norte vs. Equipo Sur');
      expect(p.selections[1].builderMarkets).toHaveLength(2);
      expect(p).not.toHaveProperty('date');
    }
  });
  it('no borra un nombre de equipo que contenga Esta Noche en la columna izquierda', () => {
    const p = parseTicket(
      '',
      geometry.map((r) => (r.text === 'Equipo Rojo' ? line('Esta Noche FC', 160, 230) : r)),
    );
    expect(p.selections[0].event).toBe('Esta Noche FC vs. Equipo Azul');
  });
  it('separa horarios junto al equipo y fechas fragmentadas sin alterar picks numéricos', () => {
    const p = parseTicket('', [
      ...geometry.filter((r) => r.text !== '0'),
      line('21 /10/26', 710, 230),
      line('14:00', 820, 270),
      line('21/10/2026 14:00', 710, 410),
    ]);
    expect(p.selections[0].event).toBe('Equipo Rojo vs. Equipo Azul');
    expect(p.selections[1].event).toBe('Equipo Norte vs. Equipo Sur');
    expect(p.selections[1].builderMarkets?.[0].pick).toBe('Más de 0.5');
    expect(p.selections[1].builderMarkets).toHaveLength(2);
  });
  it('distingue promoción del resultado y conserva el signo + de un jugador', () => {
    const p = parseTicket(
      '',
      [line('O 1+', 10, 10), line('Jugador Ejemplo Tiros al Arco', 10, 50)],
      [{ promotion: 'Suplente de Oro', bbox: { x0: 60, y0: 5, x1: 80, y1: 30 } }],
    );
    expect(p.selections[0]).toMatchObject({
      event: '',
      market: 'Jugador Ejemplo Tiros al Arco',
      pick: '1+',
      odds: null,
      promotion: 'Suplente de Oro',
    });
    expect(p.stake).toBeUndefined();
    expect(p.odds).toBeUndefined();
    expect(p.warnings.some((w) => w.includes('Captura parcial'))).toBe(true);
  });
  it('lee cuota grande con icono intermedio y mantiene bono separado', () => {
    const p = parseTicket(
      'Betano\nCombinada de 12 S/1.00 E 95518.20\nGanancias potenciales S/95,518.20\nBono +S/47,758.60',
    );
    expect(p).toMatchObject({
      stake: 100,
      odds: 95518.2,
      potential: 9551820,
      bonusAmount: 4775860,
    });
    expect(p).not.toHaveProperty('settlements');
  });
  it('incluye promociones en la huella semántica', () => {
    const b = { houseId: 'h', date: '2026-10-15T12:00:00Z', stake: 100, odds: 2 };
    const s = { event: 'A vs B', market: 'Tiros al arco de jugador', pick: '1+' };
    expect(fingerprint(b, [s])).not.toBe(fingerprint(b, [{ ...s, promotion: 'Suplente de Oro' }]));
  });
  it('reordena columnas sin separar palabras de una línea', () => {
    const rows = visualRows([line('Equipo largo', 160, 100), line('1.20', 900, 103)].reverse());
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('Equipo largo 1.20');
  });
  it('asocia una cuota aislada justo debajo del título, sin calcular su valor', () => {
    const p = parseTicket(
      '',
      geometry.map((r) => (r.text === '1.11' ? line('1.11', 900, 173) : r)),
    );
    expect(p.selections).toHaveLength(2);
    expect(p.selections[0]).toMatchObject({
      pick: 'Más de 0.5',
      odds: 1.11,
      event: 'Equipo Rojo vs. Equipo Azul',
    });
  });
  it('no asocia una cuota aislada con una etiqueta de mercado ni cruza un espacio grande', () => {
    for (const y of [213, 300]) {
      const p = parseTicket(
        '',
        geometry.map((r) => (r.text === '1.11' ? line('1.11', 900, y) : r)),
      );
      expect(p.selections).toHaveLength(1);
      expect(p.warnings.some((w) => w.includes('indica 2'))).toBe(true);
    }
  });
  it('conserva mercado de equipo, periodo, tarjetas y cuota única del Builder', () => {
    const p = parseTicket('', geometry);
    expect(p).toMatchObject({
      house: 'Betano',
      kind: 'Combinada',
      stake: 150,
      odds: 46,
      potential: 6901,
      cashoutOffer: 76,
      expectedSelections: 2,
    });
    expect(p.selections).toHaveLength(2);
    expect(p.selections[0]).toMatchObject({
      event: 'Equipo Rojo vs. Equipo Azul',
      market: 'Equipo Azul - Goles totales Más/Menos',
      odds: 1.11,
    });
    expect(p.selections[1]).toMatchObject({
      event: 'Equipo Norte vs. Equipo Sur',
      odds: 1.31,
      builderMarkets: [
        { pick: 'Más de 0.5', market: 'Goles en Primer Tiempo' },
        { pick: 'Sí', market: 'Ambos equipos reciben una tarjeta' },
      ],
    });
    expect(p.warnings.some((w) => w.includes('difiere'))).toBe(true);
    expect(p).not.toHaveProperty('date');
    expect(p).not.toHaveProperty('settlements');
  });
  it('advierte selecciones faltantes sin completar ni inventar equipos', () => {
    const p = parseTicket('', [...header, ...body.slice(0, 4), ...footer]);
    expect(p.selections).toHaveLength(1);
    expect(p.selections[0].event).toBe('');
    expect(p.warnings.some((w) => w.includes('indica 2'))).toBe(true);
  });
  it('no interpreta un mercado con guion como un evento', () => {
    expect(
      parseTicket('Betano\nEquipo Azul - Goles totales Más/Menos\nMás de 2.5').selections,
    ).toEqual([]);
  });
  it('incluye mercados internos en la huella y valida compatibilidad de datos antiguos', () => {
    const old = {
      id: 's',
      betId: 'b',
      event: 'A vs B',
      market: 'Bet Builder',
      pick: 'Bet Builder',
      odds: 2,
      sport: '',
      league: '',
    };
    expect(selectionSchema.parse(old)).toEqual(old);
    const b = { houseId: 'h', date: '2026-10-15T12:00:00Z', stake: 100, odds: 2 };
    const grouped = {
      ...old,
      builderMarkets: [
        { market: 'Córners', pick: 'Más de 6.5' },
        { market: 'Goles primer tiempo', pick: 'Más de 0.5' },
      ],
    };
    expect(selectionSchema.parse(grouped).builderMarkets).toHaveLength(2);
    expect(fingerprint(b, [grouped])).not.toBe(
      fingerprint(b, [{ ...grouped, builderMarkets: [{ market: 'Córners', pick: 'Más de 8.5' }] }]),
    );
  });
});
