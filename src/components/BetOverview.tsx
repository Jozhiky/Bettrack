import { CircleDollarSign, ScanLine, Shield } from 'lucide-react';
import { money, position, type Bet, type StoredSettlement } from '../domain/model';
import { signClass } from './ui';

/** A single scope for all three figures: current currency and active filters. */
export function BetOverview({ bets, settlements, currency }: {
  bets: Bet[]; settlements: StoredSettlement[]; currency: string;
}) {
  const positions = bets.map(b => position(b, settlements));
  const risk = positions.reduce((sum, p) => sum + p.remaining, 0);
  const profit = positions.reduce((sum, p) => sum + p.profit, 0);
  const groups = [
    { label: 'Pendientes', state: 'Pendiente', tone: 'pending' },
    { label: 'Ganadas', state: 'Ganada', tone: 'won' },
    { label: 'Perdidas', state: 'Perdida', tone: 'lost' },
    { label: 'Cashout', state: 'Cashout', tone: 'cashout' },
  ].map(group => ({ ...group, count: positions.filter(p => p.status === group.state).length }));
  return (
    <section className="bet-overview" aria-label="Resumen de apuestas según filtros">
      <div className="overview-risk">
        <span className="overview-label"><Shield size={16} /> Capital en riesgo</span>
        <strong>{money(risk, currency)}</strong>
        <span>{groups[0].count} pendientes · retorno no garantizado</span>
      </div>
      <div className="overview-result">
        <span className="overview-label"><CircleDollarSign size={16} /> Resultado neto</span>
        <strong className={signClass(profit)}>{money(profit, currency)}</strong>
        <span>Solo apuestas liquidadas</span>
      </div>
      <div className="overview-distribution">
        <div className="overview-label"><ScanLine size={16} /> Tu actividad <small>Según filtros · {currency}</small></div>
        <div className="overview-track" aria-hidden="true">
          {groups.filter(g => g.count).map(g => <span key={g.state} className={g.tone} style={{ flex: g.count }} />)}
        </div>
        <div className="overview-legend">
          {groups.map(g => <span key={g.state}><i className={g.tone} /><b>{g.count}</b> {g.label}</span>)}
        </div>
      </div>
    </section>
  );
}
