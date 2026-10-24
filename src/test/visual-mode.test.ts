import { it, expect } from 'vitest';
import { captureMode, findLiveLightning } from '../ocr/visualMode';
import { captureTiming } from '../ocr/automaticImport';
import { settlementEvidence } from '../ocr/settlement';
const evidence = {
  mode: 'live' as const,
  basis: 'betano-orange-lightning-v1' as const,
  imageHash: 'a'.repeat(64),
  bbox: { x0: 0.89, y0: 0.54, x1: 0.92, y1: 0.59 },
};
it('recognizes user-confirmed Betano lightning independently from its executed cashout receipt', () => {
  const draft = {
    house: 'Betano',
    text: 'Simple S/16.17 Cash Out\nApuesta S/16.17\nGanancias S/66.30',
    visualMode: evidence,
    stake: 1617,
  };
  expect(captureMode(draft)).toBe('live');
  expect(
    captureTiming(
      { ...draft, selections: [], warnings: [], confidence: {} },
      {
        id: 'u',
        imageId: 'i',
        createdAt: '2026-10-24T12:00:00Z',
        status: 'review',
        progress: 100,
        reason: '',
        draftJson: '',
      },
      new Date().toISOString(),
    ).mode,
  ).toBe('live');
  expect(settlementEvidence(draft)).toMatchObject({ kind: 'Cashout', receiptReturn: 6630 });
  expect(6630 - 1617).toBe(5013);
});
it('lightning alone never credits an offered cashout or accepts an unplaced bet', () => {
  const draft = {
    house: 'Betano',
    text: 'Simple S/100.00 2.00\nCASH OUT S/80.00',
    visualMode: evidence,
  };
  expect(captureMode(draft)).toBe('live');
  expect(settlementEvidence(draft).candidate).toBe(false);
});
it('does not equate a live clock or an absent icon to placement mode; conflicting labels stay unknown', () => {
  expect(captureMode({ house: 'Betano', text: '66:14\nHoy 18:00' })).toBe('unknown');
  expect(captureMode({ house: 'Bet365', text: '', visualMode: evidence })).toBe('unknown');
  expect(captureMode({ house: 'Betano', text: 'Apuesta prematch', visualMode: evidence })).toBe(
    'unknown',
  );
});
it.each([1, 2, 3])(
  'recognizes the compact zigzag at scale %i without relying on OCR text',
  (scale) => {
    const width = 360 * scale,
      height = 306 * scale,
      data = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < data.length; p += 4) data.set([32, 36, 54, 255], p);
    const points = [
      [0.55, 0],
      [0, 0.6],
      [0.4, 0.6],
      [0.45, 1],
      [1, 0.35],
      [0.6, 0.35],
    ];
    for (let y = 0; y < 14 * scale; y++)
      for (let x = 0; x < 10 * scale; x++) {
        const u = (x + 0.5) / (10 * scale),
          v = (y + 0.5) / (14 * scale);
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [a, b] = points[i],
            [c, d] = points[j];
          if (b > v !== d > v && u < ((c - a) * (v - b)) / (d - b) + a) inside = !inside;
        }
        if (inside) data.set([255, 85, 50, 255], ((167 * scale + y) * width + 322 * scale + x) * 4);
      }
    expect(findLiveLightning({ width, height, data })).toBeDefined();
  },
);
it.each(['rectangle', 'circle', 'plus', 'green-check', 'brand'])(
  'rejects %s as proof of live placement',
  (kind) => {
    const width = 360,
      height = 306,
      data = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < data.length; p += 4) data.set([32, 36, 54, 255], p);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const dx = x - 327,
          dy = y - 174;
        const fill =
          kind === 'brand'
            ? y < 60
            : kind === 'rectangle'
              ? Math.abs(dx) < 5 && Math.abs(dy) < 7
              : kind === 'circle'
                ? dx * dx + dy * dy < 49
                : kind === 'plus'
                  ? (Math.abs(dx) < 2 && Math.abs(dy) < 8) || (Math.abs(dx) < 7 && Math.abs(dy) < 2)
                  : Math.abs(dx) < 4 && Math.abs(dy) < 7;
        if (fill)
          data.set(
            kind === 'green-check' ? [0, 200, 60, 255] : [255, 85, 50, 255],
            (y * width + x) * 4,
          );
      }
    expect(findLiveLightning({ width, height, data })).toBeUndefined();
  },
);
