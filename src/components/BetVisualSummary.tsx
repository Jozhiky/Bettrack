import { money, position, selectionCount, type Bet, type Selection, type StoredSettlement } from '../domain/model';
import { Badge, signClass } from './ui';
import { ticketTitle } from './TicketSummary';

export function BetVisualSummary({ bet, rows, settlements, currency }: {
  bet: Bet; rows: Selection[]; settlements: StoredSettlement[]; currency?: string;
}) {
  const p = position(bet, settlements);
  const pending = p.status === 'Pendiente';
  const returned = pending ? bet.potential : p.returned;
  const scale = Math.max(bet.stake, returned ?? 0, 1);
  return <section className="bet-visual-summary">
    <div className="visual-title"><Badge status={p.status} /><span>{bet.kind}</span></div>
    <h3>{ticketTitle(bet, rows)}</h3>
    <div className="visual-facts">
      <span><b>{rows.length}</b> {rows.length === 1 ? 'partido' : 'partidos'}</span>
      <span><b>{selectionCount(rows)}</b> {selectionCount(rows) === 1 ? 'mercado' : 'mercados'}</span>
      <span><b>{bet.odds?.toFixed(2) ?? 'No visible'}</b> cuota total{bet.oddsSource === 'selection-product' ? ' · calculada de las selecciones' : ''}</span>
    </div>
    <figure className="money-comparison" aria-label="Comparación de monto apostado y retorno">
      <div className="money-bar-label"><span>Apostado</span><strong>{money(bet.stake, currency)}</strong></div>
      <div className="money-track"><div className="money-bar stake" style={{width: `${bet.stake / scale * 100}%`}} /></div>
      <div className="money-bar-label"><span>{pending ? 'Retorno potencial' : 'Cobrado'}</span><strong>{returned === null ? 'No visible' : money(returned, currency)}</strong></div>
      <div className="money-track"><div className={`money-bar ${pending ? 'potential' : 'returned'}`} style={{width: `${(returned ?? 0) / scale * 100}%`}} /></div>
      <figcaption>{pending ? 'Potencial, todavía no cobrado.' : 'Importes registrados en tu banca.'}</figcaption>
    </figure>
    {!pending && <div className={`visual-net ${signClass(p.profit)}`}><span>Resultado neto</span><strong>{money(p.profit, currency)}</strong></div>}
  </section>;
}
