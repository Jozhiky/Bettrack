import { describe, expect, it } from 'vitest';
import { isMarketLine, isSelectionNotice } from '../ocr/markets';

describe('Vocabulary does not rewrite market scope or line', () => {
  it.each([
    'Anotar en cualquier momento',
    'Jugador que anota o da una asistencia',
    'Primer goleador',
    'Último goleador',
    'Total de Saques de banda',
    'Saques de meta',
    'Saques de puerta',
    'Fueras de juego',
    'Atajadas',
    'Quites',
    'Pases completados',
    'Faltas recibidas',
    'Tiros libres',
    'Posesión del balón',
    'Portería a cero',
    'Resultado del Primer Tiempo',
    'Marcador Correcto en Cualquier Momento',
    'Descanso/Final',
    'Empate no válido',
    'Doble oportunidad',
    'Clasifica',
    'Hándicap Asiático',
    'Goles totales Más/Menos',
    'Próximo gol antes de 70:00 (Gol 5)',
    'Próximo gol antes de 60:00 (Gol 5)',
    'Proximo gol antes de 60:00 (Gol 5)',
    'Siguiente gol',
    'Minuto del primer gol',
    'Paris Saint-Germain - Goles totales Más/Menos',
    'Más/Menos Goles en Primer Tiempo',
    'Erling Haaland Tiros al Arco',
    'Remates totales',
    'Tiros de esquina',
    'Ambos equipos reciben una tarjeta',
    'Ganador del Partido',
    'Total de Puntos Más/Menos',
    'Rebotes',
    'Triples',
    'Total de Sets',
    'Total de juegos',
    'Aces',
    'Dobles faltas',
    'Tie-break',
    'Total de asaltos',
  ])('recognizes label %s', (label) => expect(isMarketLine(label)).toBe(true));

  it.each([
    'Más de 2.5',
    'Menos 4.5',
    'Menos de 1.5',
    '1+',
    '4+',
    '-0.25',
    '+2',
    '1-5',
    'Sí',
    'No',
    'Erling Haaland (Manchester City)',
    'Real Madrid',
    'Germain)',
    'Ganado con Pago Anticipado',
    'Mercado nuevo sin identificar',
    'Gol antes del minuto 60:00',
    'Gol antes del minuto 70:00',
    'Sin gol',
    'Gol Gohar FC',
  ])('does not turn selection or unknown text into a market: %s', (text) =>
    expect(isMarketLine(text)).toBe(false),
  );

  it('recognizes a leg notice without classifying a potential offer as a result', () => {
    expect(isSelectionNotice('Ganado con Pago Anticipado')).toBe(true);
    expect(isSelectionNotice('Pago anticipado +2')).toBe(false);
    expect(isMarketLine('Ganado con Pago Anticipado')).toBe(false);
  });
});
