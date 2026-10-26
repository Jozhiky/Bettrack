import { afterEach, expect, it, vi } from 'vitest';
import { CloudStore } from '../data/cloudStore';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
  from: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
}));
vi.mock('../integrations/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function setup() {
  mocks.from.mockReturnValue(mocks.query);
  mocks.query.select.mockReturnValue(mocks.query);
  mocks.query.eq.mockReturnValue(mocks.query);
  const store = new CloudStore();
  store.userId = 'synthetic-account';
  return store;
}
it('uses a committed server clock bound when the device clock is ahead', async () => {
  const store = setup(),
    serverAt = Date.now() - 500;
  await store.table('settings').put({ id: 'settings' });
  mocks.query.maybeSingle.mockResolvedValue({
    data: { occurred_at: new Date(serverAt).toISOString() },
    error: null,
  });
  vi.spyOn(Date, 'now').mockReturnValue(serverAt + 60000);
  const result = Date.parse(await store.captureBookingTime());
  expect(result).toBeGreaterThanOrEqual(serverAt);
  expect(result).toBeLessThan(serverAt + 5000);
  expect(mocks.from).toHaveBeenCalledWith('bt_server_audit');
  expect(mocks.query.eq).toHaveBeenCalledWith('user_id', 'synthetic-account');
  expect(mocks.query.eq).toHaveBeenCalledWith('version', 1);
});
it('does not invent a server clock when no local commit was confirmed', async () => {
  const store = setup();
  await expect(store.captureBookingTime()).rejects.toThrow('referencia horaria');
  expect(mocks.from).not.toHaveBeenCalled();
});
it('keeps accounting valid when the server clock is ahead of the device', async () => {
  const store = setup(),
    clientNow = Date.now();
  await store.table('settings').put({ id: 'settings' });
  mocks.query.maybeSingle.mockResolvedValue({
    data: { occurred_at: new Date(clientNow + 5000).toISOString() },
    error: null,
  });
  vi.spyOn(Date, 'now').mockReturnValue(clientNow);
  expect(Date.parse(await store.captureBookingTime())).toBe(clientNow);
});
it('rejects an unavailable server clock and a session changed during its read', async () => {
  const store = setup();
  await store.table('settings').put({ id: 'settings' });
  mocks.query.maybeSingle.mockResolvedValue({ error: { message: 'offline' }, data: null });
  await expect(store.captureBookingTime()).rejects.toThrow('fecha contable');
  mocks.query.maybeSingle.mockImplementation(async () => {
    store.reset();
    return { data: { occurred_at: new Date().toISOString() }, error: null };
  });
  await expect(store.captureBookingTime()).rejects.toThrow('fecha contable');
});
