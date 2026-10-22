import { CalendarDays, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui';
import { useApp } from '../app/context';
import { limaDay, position, kinds, states, type Bet, type Snapshot } from '../domain/model';
export interface Filter {
  period: string;
  house: string;
  streamer: string;
  kind: string;
  state: string;
  start: string;
  end: string;
}
export const initialFilter: Filter = {
  period: 'Todo el historial',
  house: '',
  streamer: '',
  kind: '',
  state: '',
  start: '',
  end: '',
};
export function filterBets(data: Snapshot, f: Filter, currency: string) {
  const today = limaDay(new Date().toISOString());
  const previous = (days: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  let start = '',
    end = today;
  if (f.period === 'Hoy') start = today;
  else if (f.period === 'Ayer') start = end = previous(1);
  else if (f.period === 'Últimos 7 días') start = previous(6);
  else if (f.period === 'Últimos 30 días') start = previous(29);
  else if (f.period === 'Mes actual') start = today.slice(0, 7) + '-01';
  else if (f.period === 'Personalizado') {
    start = f.start;
    end = f.end;
  } else end = '';
  return data.bets.filter((b) => {
    const day = limaDay(b.date);
    return (
      data.houses.find((h) => h.id === b.houseId)?.currency === currency &&
      (!start || day >= start) &&
      (!end || day <= end) &&
      (!f.house || b.houseId === f.house) &&
      (!f.streamer || b.streamerId === f.streamer) &&
      (!f.kind || b.kind === f.kind) &&
      (!f.state || position(b, data.settlements).status === f.state)
    );
  });
}
export function scopedData(data: Snapshot, bets: Bet[]): Snapshot {
  const ids = new Set(bets.map((b) => b.id));
  return {
    ...data,
    bets,
    settlements: data.settlements.filter((s) => ids.has(s.betId)),
    selections: data.selections.filter((s) => ids.has(s.betId)),
  };
}
export function Filters({
  value,
  onChange,
  compact = false,
}: {
  value: Filter;
  onChange: (f: Filter) => void;
  compact?: boolean;
}) {
  const { data, settings } = useApp();
  const [expanded, setExpanded] = useState(false);
  const field = (k: keyof Filter, v: string) => {
    onChange({ ...value, [k]: v });
    if (
      ['kind', 'state', 'streamer'].includes(k) &&
      window.matchMedia('(max-width: 700px)').matches
    )
      setExpanded(false);
  };
  const active = [
    value.period !== initialFilter.period ? value.period : '',
    data.houses.find((h) => h.id === value.house)?.name,
    data.streamers.find((s) => s.id === value.streamer)?.name,
    value.kind,
    value.state,
    value.period === 'Personalizado' ? [value.start, value.end].filter(Boolean).join(' → ') : '',
  ].filter(Boolean);
  return (
    <div className={`filter-region ${compact ? 'compact-filters' : ''}`}>
      <div className="filters">
        <div className="filter-label">
          <SlidersHorizontal size={16} />
          <span>Filtrar</span>
        </div>
        <label className="select-icon">
          <CalendarDays size={15} />
          <select
            aria-label="Periodo"
            value={value.period}
            onChange={(e) => field('period', e.target.value)}
          >
            {[
              'Todo el historial',
              'Hoy',
              'Ayer',
              'Últimos 7 días',
              'Últimos 30 días',
              'Mes actual',
              'Personalizado',
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <select
          aria-label="Filtrar casa"
          value={value.house}
          onChange={(e) => field('house', e.target.value)}
        >
          <option value="">Todas las casas</option>
          {data.houses
            .filter((h) => h.currency === settings.currency)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
        </select>
        <details
          className="extra-filters"
          open={compact || expanded}
          onToggle={(e) => setExpanded(e.currentTarget.open)}
        >
          <summary>
            <SlidersHorizontal size={14} /> Más filtros
          </summary>
          <div className="extra-filter-fields">
            <select
              aria-label="Filtrar streamer"
              value={value.streamer}
              onChange={(e) => field('streamer', e.target.value)}
            >
              <option value="">Todos los streamers</option>
              {data.streamers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar tipo"
              value={value.kind}
              onChange={(e) => field('kind', e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <select
              aria-label="Filtrar estado"
              value={value.state}
              onChange={(e) => field('state', e.target.value)}
            >
              <option value="">Todos los estados</option>
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </details>
        {value.period === 'Personalizado' && (
          <>
            <input
              type="date"
              aria-label="Desde"
              value={value.start}
              onChange={(e) => field('start', e.target.value)}
            />
            <input
              type="date"
              aria-label="Hasta"
              value={value.end}
              onChange={(e) => field('end', e.target.value)}
            />
          </>
        )}
        {active.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              onChange(initialFilter);
              setExpanded(false);
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>
      {active.length > 0 && (
        <div className="active-filters" aria-label="Filtros activos">
          {active.map((text, i) => (
            <span key={i}>{text}</span>
          ))}
        </div>
      )}
    </div>
  );
}
