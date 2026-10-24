import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Wallet, ShieldCheck, Upload, ArrowRight, Activity } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { useApp } from '../app/context';
import { totals, money, position, limaDay, states, type Snapshot } from '../domain/model';
import { Kpi, signClass, Empty } from '../components/ui';
import { Filters, initialFilter, filterBets, scopedData } from '../components/Filters';
import { BetTable } from '../components/BetTable';
import { BetDetail } from '../components/BetDetail';
export function dailySeries(data: Snapshot) {
  const rows = new Map<string, { date: string; profit: number; bank: number; available: number }>();
  const put = (date: string) => {
    const day = limaDay(date);
    if (!rows.has(day)) rows.set(day, { date: day, profit: 0, bank: 0, available: 0 });
    return rows.get(day)!;
  };
  data.settlements.forEach((s) => {
    put(s.date).profit += (s.returned - s.closedStake) / 100;
    put(s.date).bank -= s.closedStake / 100;
  });
  data.movements.forEach((m) => {
    put(m.date).available += m.amount / 100;
    put(m.date).bank += (m.kind === 'Apuesta colocada' ? 0 : m.amount) / 100;
  });
  let accumulated = 0,
    bank = 0,
    available = 0;
  return [...rows.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      accumulated += r.profit;
      bank += r.bank;
      available += r.available;
      return {
        ...r,
        accumulated,
        bank,
        available,
        label: r.date.slice(8) + '/' + r.date.slice(5, 7),
      };
    });
}
export function Dashboard({ statistics = false }: { statistics?: boolean }) {
  const { data, settings } = useApp();
  const [filter, setFilter] = useState(initialFilter),
    [selected, setSelected] = useState<string>(),
    [chart, setChart] = useState<'accumulated' | 'profit' | 'bank'>('accumulated');
  const bets = filterBets(data, filter, settings.currency);
  const scoped = scopedData(data, bets);
  const metrics = totals(scoped, settings.currency);
  const global = totals(data, settings.currency);
  const selectedHouseIds = new Set(
    data.houses
      .filter((h) => h.currency === settings.currency && (!filter.house || h.id === filter.house))
      .map((h) => h.id),
  );
  const currencyData = {
    ...scoped,
    movements: data.movements.filter(
      (m) => selectedHouseIds.has(m.houseId) && (!m.betId || bets.some((b) => b.id === m.betId)),
    ),
  };
  const resultSeries = dailySeries(currencyData);
  const currencyHouses = new Set(
    data.houses.filter((h) => h.currency === settings.currency).map((h) => h.id),
  );
  const currencyBets = new Set(
    data.bets.filter((b) => currencyHouses.has(b.houseId)).map((b) => b.id),
  );
  const bankSeries = dailySeries({
    ...data,
    movements: data.movements.filter((m) => currencyHouses.has(m.houseId)),
    settlements: data.settlements.filter((s) => currencyBets.has(s.betId)),
  });
  const series = chart === 'bank' ? bankSeries : resultSeries;
  const lastDay = series.at(-1);
  const chartValue =
    chart === 'bank'
      ? (lastDay?.bank ?? 0) * 100
      : chart === 'profit'
        ? (lastDay?.profit ?? 0) * 100
        : metrics.profit;
  const chartLabel =
    chart === 'bank'
      ? 'Banca actual · todo el historial de la moneda'
      : chart === 'profit'
        ? 'Resultado del último día mostrado' + (lastDay ? ' · ' + lastDay.label : '')
        : 'Beneficio acumulado · apuestas filtradas';
  const realDays = resultSeries.filter((s) => s.profit !== 0);
  const best = realDays.length
    ? realDays.reduce((a, b) => (a.profit > b.profit ? a : b))
    : undefined;
  const worst = realDays.length
    ? realDays.reduce((a, b) => (a.profit < b.profit ? a : b))
    : undefined;
  const grouped = (key: 'house' | 'streamer' | 'kind' | 'live') => {
    const groups = new Map<
      string,
      {
        name: string;
        profit: number;
        count: number;
        closed: number;
        odds: number;
        knownOdds: number;
      }
    >();
    for (const b of bets) {
      const name =
        key === 'house'
          ? data.houses.find((h) => h.id === b.houseId)?.name
          : key === 'streamer'
            ? data.streamers.find((s) => s.id === b.streamerId)?.name || 'Sin atribución'
            : key === 'kind'
              ? b.kind
              : b.timingUnknown
                ? 'Sin determinar'
                : b.live
                  ? 'En vivo'
                  : 'Prepartido';
      const g = groups.get(name!) || {
        name: name!,
        profit: 0,
        count: 0,
        closed: 0,
        odds: 0,
        knownOdds: 0,
      };
      const p = position(b, data.settlements);
      g.profit += p.profit;
      g.closed += p.closed;
      g.count++;
      if (b.odds !== null) {
        g.odds += b.odds;
        g.knownOdds++;
      }
      groups.set(name!, g);
    }
    return [...groups.values()];
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU ACTIVIDAD, EN PERSPECTIVA</div>
          <h1>
            {statistics ? 'Estadísticas' : 'Resumen de tu banca'}
            <span className="heading-dot" />
          </h1>
          <p>Decisiones informadas. Un registro claro de cada movimiento.</p>
        </div>
        <Link to="/apuestas" className="button secondary">
          <Upload size={16} /> Subir capturas
        </Link>
      </div>
      {!statistics && (
        <section className="bank-overview" aria-labelledby="bank-overview-title">
          <div className="section-heading">
            <div>
              <h2 id="bank-overview-title">Tu banca actual</h2>
              <p>Todos tus movimientos en {settings.currency} · independiente de los filtros</p>
            </div>
            <Link to="/banca">
              Gestionar banca <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="kpi-grid bank-kpis">
            <Kpi
              label="Banca consolidada"
              value={money(global.bank, settings.currency)}
              hint="Disponible + capital en riesgo"
              tone="featured"
              icon={<Wallet size={19} />}
            />
            <Kpi
              label="Saldo disponible"
              value={money(global.available, settings.currency)}
              hint="Saldo contable de tus billeteras"
            />
            <Kpi
              label="Capital en riesgo"
              value={money(global.committed, settings.currency)}
              hint={global.pending + ' pendientes · retorno no garantizado'}
              icon={<ShieldCheck size={18} />}
            />
          </div>
          <div className="balance-strip">
            <span>
              Capital inicial <strong>{money(global.initial, settings.currency)}</strong>
            </span>
            <span>
              Depósitos <strong>{money(global.deposits, settings.currency)}</strong>
            </span>
            <span>
              Retiros <strong>{money(global.withdrawals, settings.currency)}</strong>
            </span>
          </div>
        </section>
      )}
      <section className="results-overview" aria-labelledby="results-overview-title">
        <div className="section-heading">
          <div>
            <h2 id="results-overview-title">Resultados de tus apuestas</h2>
            <p>
              Filtra por fecha de apuesta o carga. Incluye los cobros posteriores de esos boletos.
            </p>
          </div>
        </div>
        <Filters value={filter} onChange={setFilter} />
        <div className="kpi-grid result-kpis">
          <Kpi
            label="Resultado neto"
            value={money(metrics.profit, settings.currency)}
            hint="Solo dinero realizado · apuestas filtradas"
            tone={signClass(metrics.profit)}
          />
          <Kpi
            label="Yield realizado"
            value={metrics.yield.toFixed(2) + '%'}
            hint="Resultado / monto liquidado"
            tone={signClass(metrics.yield)}
            icon={<Activity size={18} />}
          />
          <Kpi
            label="Apuestas liquidadas"
            value={String(metrics.won + metrics.lost + metrics.cashouts)}
            hint={
              metrics.won +
              ' ganadas · ' +
              metrics.lost +
              ' perdidas · ' +
              metrics.cashouts +
              ' cashouts'
            }
          />
        </div>
      </section>
      {(global.committed > settings.exposureLimit ||
        -global.profit > settings.lossLimit ||
        global.available < 0) && (
        <div className="notice warning">
          {global.available < 0
            ? 'Saldo contable negativo. Revisa movimientos y correcciones.'
            : global.committed > settings.exposureLimit
              ? 'Tu exposición supera el límite configurado.'
              : 'Tu pérdida acumulada supera el límite configurado.'}{' '}
          <Link to="/configuracion">Revisar límites</Link>
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <h2>
                {chart === 'bank'
                  ? 'Evolución de banca'
                  : chart === 'profit'
                    ? 'Resultado por día'
                    : 'Beneficio acumulado'}
              </h2>
              <p>
                {chart === 'bank'
                  ? 'Todos los movimientos · filtros no aplicados'
                  : 'Cobros por día · apuestas filtradas'}{' '}
                · {settings.currency}
              </p>
            </div>
            <select
              aria-label="Métrica del gráfico"
              value={chart}
              onChange={(e) => setChart(e.target.value as typeof chart)}
            >
              <option value="accumulated">Beneficio acumulado</option>
              <option value="profit">Balance diario</option>
              <option value="bank">Banca global · moneda</option>
            </select>
          </div>
          <div className="chart-value">
            <strong className={chart === 'bank' ? '' : signClass(chartValue)}>
              {money(chartValue, settings.currency)}
            </strong>
            <span>{chartLabel}</span>
          </div>
          {!series.length ? (
            <Empty
              title="Cada decisión cuenta"
              description="Tu evolución aparecerá al registrar capital y apuestas. Sin datos de demostración."
            />
          ) : (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 15, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--info)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--info)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                    }}
                    formatter={(value) => money(Math.round(Number(value) * 100), settings.currency)}
                  />
                  <Area
                    name={
                      chart === 'bank'
                        ? 'Banca'
                        : chart === 'profit'
                          ? 'Resultado diario'
                          : 'Beneficio acumulado'
                    }
                    type="monotone"
                    dataKey={chart}
                    stroke="var(--info)"
                    fill="url(#chartFill)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {chart !== 'bank' && (
            <div className="chart-foot">
              <span>
                Mejor día{' '}
                <strong className={signClass(best?.profit ?? 0)}>
                  {best ? `${best.label} · ${money(best.profit * 100, settings.currency)}` : '—'}
                </strong>
              </span>
              <span>
                Peor día{' '}
                <strong className={signClass(worst?.profit ?? 0)}>
                  {worst ? `${worst.label} · ${money(worst.profit * 100, settings.currency)}` : '—'}
                </strong>
              </span>
            </div>
          )}
        </section>
        <section className="panel state-panel">
          <div className="section-heading">
            <div>
              <h2>Tus apuestas</h2>
              <p>Distribución de resultados</p>
            </div>
            <span className="mini-label">{bets.length} TOTAL</span>
          </div>
          <div className="result-total">
            <strong>{metrics.won + metrics.lost + metrics.cashouts}</strong>
            <span>ganadas, perdidas o cashouts</span>
          </div>
          <div className="state-track">
            {states.map((s, i) => {
              const count = bets.filter((b) => position(b, data.settlements).status === s).length;
              return count ? (
                <span
                  key={s}
                  style={{
                    flex: count,
                    background: [
                      'var(--pending)',
                      'var(--positive)',
                      'var(--negative)',
                      'var(--info)',
                    ][i],
                  }}
                />
              ) : null;
            })}
          </div>
          <div className="state-list">
            {states.map((s) => (
              <div key={s}>
                <span>
                  <i className={`state-dot ${s.toLowerCase()}`} />
                  {s}
                </span>
                <strong>
                  {bets.filter((b) => position(b, data.settlements).status === s).length}
                </strong>
              </div>
            ))}
          </div>
          <div className="mini-metrics">
            <span>
              Cuota promedio <strong>{metrics.average?.toFixed(2) ?? 'No visible'}</strong>
            </span>
            <span>
              Rentabilidad*{' '}
              <strong className={signClass(metrics.roi)}>{metrics.roi.toFixed(2)}%</strong>
            </span>
          </div>
          <small className="muted">
            *Resultado seleccionado / capital inicial y depósitos globales.
          </small>
        </section>
      </div>
      {statistics && (
        <>
          <div className="kpi-grid">
            <Kpi
              label="Ganancias netas positivas"
              value={money(metrics.gains, settings.currency)}
              hint="Por apuesta"
              tone="positive"
            />
            <Kpi
              label="Pérdidas realizadas"
              value={money(metrics.losses, settings.currency)}
              hint="Por apuesta"
              tone="negative"
            />
            <Kpi
              label="Stake liquidado"
              value={money(metrics.closed, settings.currency)}
              hint="Base del yield"
            />
            <Kpi
              label="Cuota promedio"
              value={metrics.average?.toFixed(2) ?? 'No visible'}
              hint="Solo cuotas conocidas"
            />
          </div>
          <div className="dashboard-grid stats-grid">
            {(['house', 'streamer', 'kind', 'live'] as const).map((key) => (
              <section className="panel" key={key}>
                <div className="section-heading">
                  <h2>
                    {
                      {
                        house: 'Por casa de apuestas',
                        streamer: 'Por streamer',
                        kind: 'Por tipo de apuesta',
                        live: 'En vivo vs. prepartido',
                      }[key]
                    }
                  </h2>
                </div>
                {grouped(key).length ? (
                  <>
                    <div className="chart compact">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={grouped(key)}>
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                          <YAxis
                            tickFormatter={(v) => String(v / 100)}
                            tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          />
                          <Tooltip
                            formatter={(v) => money(Number(v), settings.currency)}
                            contentStyle={{ background: 'var(--panel)' }}
                          />
                          <Bar dataKey="profit" name="Resultado" radius={[4, 4, 0, 0]}>
                            {grouped(key).map((g) => (
                              <Cell
                                key={g.name}
                                fill={g.profit < 0 ? 'var(--negative)' : 'var(--positive)'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {grouped(key).map((g) => (
                      <div className="list-row" key={g.name}>
                        <div>
                          <strong>{g.name}</strong>
                          <small>
                            {g.count} apuestas · cuota{' '}
                            {g.knownOdds ? (g.odds / g.knownOdds).toFixed(2) : 'No visible'} · yield{' '}
                            {g.closed ? ((g.profit / g.closed) * 100).toFixed(2) : '0.00'}%
                          </small>
                        </div>
                        <strong className={signClass(g.profit)}>
                          {money(g.profit, settings.currency)}
                        </strong>
                      </div>
                    ))}
                  </>
                ) : (
                  <Empty
                    title="Aún no hay resultados"
                    description="Se calcularán a partir de tus apuestas."
                  />
                )}
              </section>
            ))}
          </div>
        </>
      )}
      {!statistics && (
        <>
          <div className="section-heading outside">
            <div>
              <h2>Actividad reciente</h2>
              <p>Tu registro, siempre al día.</p>
            </div>
            <Link to="/apuestas" className="text-link">
              Ver todas <ArrowRight size={15} />
            </Link>
          </div>
          <section className="panel table-panel">
            <BetTable
              bets={[...bets].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)}
              onSelect={setSelected}
            />
          </section>
          <div className="privacy-note">
            <ShieldCheck size={14} /> Tu registro privado en Supabase, disponible en tus
            dispositivos.
          </div>
        </>
      )}
      {selected && <BetDetail betId={selected} onClose={() => setSelected(undefined)} />}
    </>
  );
}
