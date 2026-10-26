// Bound accounting time by both clocks. A server-ahead/device-behind clock must
// not make a legitimate import fail the unchanged client-side future-date guard.
// This is accounting metadata only, never the historical bet/settlement date.
export function conservativeBookingTime(serverAt: string, elapsed: number, clientNow = Date.now()) {
  const server = Date.parse(serverAt);
  if (!Number.isFinite(server) || !Number.isFinite(elapsed) || !Number.isFinite(clientNow))
    throw Error('Referencia horaria inválida. La captura sigue conservada.');
  return new Date(Math.min(clientNow, server + Math.max(0, elapsed))).toISOString();
}
