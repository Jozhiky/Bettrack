export interface TicketAdapter {
  name: string;
  matches: (text: string) => boolean;
  stake: string[];
  odds: string[];
  potential: string[];
}
export const genericAdapter: TicketAdapter = {
  name: 'Genérico',
  matches: () => true,
  stake: [
    'importe apostado',
    'monto apostado',
    'apuesta total',
    'total apostado',
    'stake',
    'importe de apuesta',
  ],
  odds: ['cuota total', 'cuotas totales', 'total odds', 'cuota'],
  potential: [
    'retorno potencial',
    'ganancia potencial',
    'ganancias potenciales',
    'posible ganancia',
    'pago potencial',
    'potential return',
  ],
};
// Each adapter only extracts labeled values. Unrecognized layouts fall back to review.
export const ticketAdapters: TicketAdapter[] = [
  {
    ...genericAdapter,
    name: 'Betano',
    matches: (text) => /betano/i.test(text),
    stake: ['importe de la apuesta', ...genericAdapter.stake, '^apuesta'],
  },
  {
    ...genericAdapter,
    name: 'Bet365',
    matches: (text) => /bet\s*365/i.test(text),
    stake: ['total de la apuesta', 'total stake', ...genericAdapter.stake],
    potential: ['retornos potenciales', 'potential returns', ...genericAdapter.potential],
  },
];
export const selectAdapter = (text: string) =>
  ticketAdapters.find((adapter) => adapter.matches(text)) ?? genericAdapter;
