import { expect, it, vi } from 'vitest';
import { readCapture } from '../ocr/readCapture';
const good =
  'BETANO\nApuesta Simple\nAlianza vs Universitario\nGoles del partido\nMas de 2.5\nCuota total: 2.00\nImporte apostado S/ 10.00\nRetorno potencial S/ 20.01';
const result = (text: string) => ({ text, lines: [], symbols: [], confidence: 80 });
it('does not run an unnecessary second OCR on a complete ticket', async () => {
  const recognize = vi.fn().mockResolvedValue(result(good));
  const p = await readCapture({ recognize, terminate: vi.fn() }, new Blob(), () => {});
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(p.potential).toBe(2001);
});
it('uses a second contrast pass only when it recovers more complete ticket data', async () => {
  const recognize = vi
    .fn()
    .mockResolvedValueOnce(result('BETANO'))
    .mockResolvedValueOnce(result(good));
  const p = await readCapture({ recognize, terminate: vi.fn() }, new Blob(), () => {});
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(recognize.mock.calls[1][3]).toBe(true);
  expect(p.stake).toBe(1000);
  expect(p.selections).toHaveLength(1);
});
it('keeps original data when enhanced OCR is worse', async () => {
  const recognize = vi
    .fn()
    .mockResolvedValueOnce(result(good))
    .mockResolvedValueOnce(result('BETANO'));
  const p = await readCapture({ recognize, terminate: vi.fn() }, new Blob(), () => {}, true);
  expect(p.potential).toBe(2001);
  expect(p.stake).toBe(1000);
});
