// Hand-authored layout probes, NOT real Tesseract output. Their expected
// interpretation is an independent oracle; no production logic is copied.
import type { OcrLine } from '../../src/ocr/layout';
import type { ExpectedTicket } from './quality';

export function line(text: string, x: number, y: number): OcrLine {
  let at = x;
  const words = text.split(' ').map((text) => {
    const x0 = at;
    at += text.length * 7 + 7;
    return { text, confidence: 95, bbox: { x0, x1: at - 7, y0: y, y1: y + 20 } };
  });
  return { text, confidence: 95, bbox: { x0: x, x1: at, y0: y, y1: y + 20 }, words };
}

export function layoutProbe(
  options: { market?: string; missingOdds?: boolean; builder?: boolean } = {},
) {
  const market = options.market ?? 'Goles totales Más/Menos';
  const first = options.builder
    ? [
        'Bet Builder',
        'Equipo Norte',
        'Equipo Sur',
        'O Más de 2.5',
        market,
        'O Sí',
        'Ambos equipos anotan',
      ]
    : ['Más de 2.5', market, 'Equipo Norte', 'Equipo Sur'];
  const lines = [
    line('Betano', 90, 10),
    line('Combinada de 2 S/10.00', 80, 70),
    line('4.00', 900, 73),
    ...first.map((text, i) => line(text, 160, 150 + i * 40)),
    ...(!options.missingOdds ? [line('2.00', 900, 153)] : []),
    ...[
      'Más de 1.5',
      'Equipo Este - Goles totales Más/Menos en Primer Tiempo',
      'Equipo Este',
      'Equipo Oeste',
    ].map((text, i) => line(text, 160, 550 + i * 40)),
    line('2.00', 900, 553),
    line('Apuesta', 80, 800),
    line('S/10.00', 900, 803),
    line('Ganancias potenciales', 80, 850),
    line('S/40.00', 900, 853),
    line('CASH OUT S/8.90', 350, 900),
  ];
  const expected: ExpectedTicket = {
    house: 'Betano',
    kind: 'Combinada',
    stake: 1000,
    odds: 4,
    potential: 4000,
    cashoutOffer: 890,
    selections: [
      {
        event: 'Equipo Norte vs. Equipo Sur',
        market: options.builder ? 'Bet Builder' : market,
        pick: options.builder ? 'Bet Builder' : 'Más de 2.5',
        odds: options.missingOdds ? null : 2,
        ...(options.builder
          ? {
              builderMarkets: [
                { market, pick: 'Más de 2.5' },
                { market: 'Ambos equipos anotan', pick: 'Sí' },
              ],
            }
          : {}),
      },
      {
        event: 'Equipo Este vs. Equipo Oeste',
        market: 'Equipo Este - Goles totales Más/Menos en Primer Tiempo',
        pick: 'Más de 1.5',
        odds: 2,
      },
    ],
  };
  return { lines, expected };
}

export const probes = [
  { id: 'layout-known', ...layoutProbe(), knownFailure: false },
  { id: 'layout-builder', ...layoutProbe({ builder: true }), knownFailure: false },
  {
    id: 'unknown-market',
    ...layoutProbe({ market: 'Mercado experimental no catalogado' }),
    knownFailure: true,
  },
  {
    id: 'unknown-builder-market',
    ...layoutProbe({ market: 'Mercado experimental no catalogado', builder: true }),
    knownFailure: true,
  },
  { id: 'missing-odds', ...layoutProbe({ missingOdds: true }), knownFailure: true },
];
