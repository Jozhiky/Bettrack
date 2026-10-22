import { it, expect } from 'vitest';
import { runBatch } from '../data/batch';
import { ocrConcurrency } from '../ocr/session';
it('limits parallel tasks, preserves order and continues after a failed file', async () => {
  let running = 0,
    peak = 0;
  const results = await runBatch([0, 1, 2, 3, 4], 2, async (n) => {
    running++;
    peak = Math.max(peak, running);
    try {
      await new Promise((r) => setTimeout(r, 5));
      if (n === 1) throw new Error('upload failed');
      return n * 2;
    } finally {
      running--;
    }
  });
  expect(peak).toBe(2);
  expect(results.map((r) => r.status)).toEqual([
    'fulfilled',
    'rejected',
    'fulfilled',
    'fulfilled',
    'fulfilled',
  ]);
  expect(results[4]).toEqual({ status: 'fulfilled', value: 8 });
});
it('keeps one OCR worker on low-memory or unknown devices', () => {
  expect(ocrConcurrency(8, 8)).toBe(2);
  expect(ocrConcurrency(2, 8)).toBe(1);
  expect(ocrConcurrency(8, 2)).toBe(1);
  expect(ocrConcurrency(8, undefined)).toBe(1);
});
