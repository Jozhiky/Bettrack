import { expect, it } from 'vitest';
import { conservativeBookingTime } from '../data/captureClock';
const now = Date.parse('2026-10-26T12:00:00.000Z');
it.each([-5000, 0, 5000])(
  'keeps accounting at or before both clocks with server offset %i',
  (offset) => {
    const serverAt = new Date(now + offset).toISOString();
    const result = Date.parse(conservativeBookingTime(serverAt, 250, now));
    expect(result).toBe(Math.min(now, now + offset + 250));
    expect(result).toBeLessThanOrEqual(now);
    expect(result).toBeLessThanOrEqual(now + offset + 250);
  },
);
it('never subtracts a negative monotonic interval from the known server instant', () => {
  expect(conservativeBookingTime(new Date(now - 1000).toISOString(), -50, now)).toBe(
    new Date(now - 1000).toISOString(),
  );
});
it('rejects an invalid clock rather than inventing a date', () => {
  expect(() => conservativeBookingTime('invalid', 20, now)).toThrow();
  expect(() => conservativeBookingTime(new Date(now).toISOString(), NaN, now)).toThrow();
});
