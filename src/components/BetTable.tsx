import type { WorkspaceItem } from '../domain/workspace';
import { CapturePending } from './CapturePending';
import { useApp } from '../app/context';
import { position, money, displayDate, type Bet } from '../domain/model';
import { Badge, signClass, Empty } from './ui';
import { QuickResult } from './QuickResult';
import { ticketTitle, ticketReference } from './TicketSummary';
export function BetTable({
  bets,
  items,
  onSelect,
}: {
  bets: Bet[];
  items?: WorkspaceItem[];
  onSelect: (id: string) => void;
}) {
  const { data } = useApp();
  const rows: WorkspaceItem[] =
    items ?? bets.map((bet) => ({ type: 'bet', id: bet.id, date: bet.date, bet }));
  if (!rows.length)
    return (
      <Empty
        title="Tu historial empieza aquí"
        description="Sube tus capturas. Las apuestas reconocidas aparecerán aquí automáticamente."
      />
    );
  return (
    <div className="table-wrap history-table" tabIndex={0} aria-label="Historial de apuestas">
      <table>
        <thead>
          <tr>
            <th>Apuesta / evento</th>
            <th>Casa</th>
            <th>Cuota</th>
            <th>Apostado</th>
            <th>Estado</th>
            <th>Resultado neto</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            if (item.type === 'capture')
              return (
                <tr key={item.id}>
                  <td colSpan={7}>
                    <CapturePending upload={item.upload} onSelect={onSelect} />
                  </td>
                </tr>
              );
            const b = item.bet;
            const p = position(b, data.settlements),
              h = data.houses.find((h) => h.id === b.houseId),
              sels = data.selections.filter((s) => s.betId === b.id);
            return (
              <tr key={b.id}>
                <td>
                  <button className="table-link" onClick={() => onSelect(b.id)}>
                    {ticketTitle(b, sels)}
                  </button>
                  <small>
                    {ticketReference(b)} · {b.dateSource === 'upload' ? 'Carga: ' : ''}
                    {displayDate(b.date)}
                  </small>
                </td>
                <td>
                  <span className="house-dot">{h?.name.slice(0, 1)}</span>
                  {h?.name}
                </td>
                <td>{b.odds?.toFixed(2) ?? 'No visible'}</td>
                <td>{money(b.stake, h?.currency)}</td>
                <td>
                  <Badge status={p.status} />
                </td>
                <td className={signClass(p.profit)}>
                  {p.closed ? money(p.profit, h?.currency) : '—'}
                </td>
                <td>
                  <QuickResult bet={b} onDetail={() => onSelect(b.id)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
