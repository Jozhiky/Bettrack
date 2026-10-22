import { selectionCount, type Bet, type Selection } from '../domain/model';

export const ticketReference = (bet: Bet) =>
  `#${bet.id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
export const ticketTitle = (bet: Bet, rows: Selection[]) =>
  bet.kind === 'Simple'
    ? rows[0]?.event || 'Boleto'
    : `Combinada · ${rows.length} ${rows.length === 1 ? 'partido' : 'partidos'}`;

export function TicketSummary({ rows }: { rows: Selection[] }) {
  const markets = selectionCount(rows);
  return (
    <details className="ticket-selections">
      <summary>
        {rows.length} {rows.length === 1 ? 'partido' : 'partidos'} · {markets}{' '}
        {markets === 1 ? 'mercado' : 'mercados'} <span>Ver selecciones</span>
      </summary>
      <ol>
        {rows.map((s) => (
          <li key={s.id}>
            <strong>{s.event}</strong>
            {s.odds !== null && <small className="selection-odds">Cuota {s.odds.toFixed(2)}</small>}
            {s.builderMarkets?.length ? (
              s.builderMarkets.map((m, i) => (
                <p key={i}>
                  {m.pick} · {m.market}
                  {m.promotion ? ` · ${m.promotion}` : ''}
                </p>
              ))
            ) : (
              <p>
                {s.pick} · {s.market}
                {s.promotion ? ` · ${s.promotion}` : ''}
              </p>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
