import { useApp } from '../app/context';
import { money, position, displayDate, type Bet } from '../domain/model';
import { Badge, Button, signClass } from './ui';
import { QuickResult } from './QuickResult';
import { TicketSummary, ticketTitle, ticketReference } from './TicketSummary';
import { Ticket, ArrowUpRight } from 'lucide-react';
export function BetCard({ bet, onSelect }: { bet: Bet; onSelect: (id: string) => void }) {
  const { data } = useApp(),
    p = position(bet, data.settlements),
    house = data.houses.find((h) => h.id === bet.houseId),
    rows = data.selections.filter((s) => s.betId === bet.id),
    pending = p.status === 'Pendiente';
  return (
    <article className="panel bet-card" data-bet-id={bet.id} data-status={p.status}>
      <div className="ticket-meta">
        <span className="ticket-identity">
          <span className="ticket-emblem" aria-hidden="true"><Ticket size={17} /></span>
          <span><b>{house?.name}</b><small>{ticketReference(bet)}</small></span>
        </span>
        <Badge status={p.status} />
      </div>
      <h2 className="ticket-title">{ticketTitle(bet, rows)}</h2>
      {bet.kind === 'Combinada' && (
        <p className="ticket-preview">
          {rows
            .slice(0, 2)
            .map((s) => s.event)
            .join(' · ')}
          {rows.length > 2 ? '…' : ''}
        </p>
      )}
      <div className="ticket-money">
        <span>{pending ? 'Monto apostado' : 'Resultado neto'}</span>
        <strong className={pending ? '' : signClass(p.profit)}>
          {money(pending ? bet.stake : p.profit, house?.currency)}
        </strong>
      </div>
      <div className="ticket-amounts">
        <span>
          {pending ? 'Cuota total' : 'Apostado'}
          <strong>{pending ? bet.odds?.toFixed(2) ?? 'No visible' : money(bet.stake, house?.currency)}</strong>
        </span>
        <span title={pending ? 'Retorno estimado: aún no es dinero cobrado.' : undefined}>
          {pending ? 'Retorno potencial' : 'Cobrado'}
          <strong>{pending && bet.potential === null ? 'No visible' : money(pending ? bet.potential! : p.returned, house?.currency)}</strong>
        </span>
      </div>
      {pending && p.needsReview && (
        <small className="ticket-note">Registro anterior: revisa sus cobros en el detalle.</small>
      )}
      <TicketSummary rows={rows} />
      <small className="ticket-date">
        {bet.dateSource === 'upload' ? 'Cargada' : 'Apostada'} {displayDate(bet.date)}
      </small>
      <div className="ticket-actions">
        {pending && <QuickResult bet={bet} onDetail={() => onSelect(bet.id)} />}
        <Button variant="ghost" onClick={() => onSelect(bet.id)}>
          Ver detalle <ArrowUpRight size={15} />
        </Button>
      </div>
    </article>
  );
}
