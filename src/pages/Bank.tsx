import { useState } from 'react';
import { Plus, ArrowRightLeft, Wallet } from 'lucide-react';
import { useApp } from '../app/context';
import { repo } from '../data/repository';
import {
  money,
  totals,
  id,
  timestamp,
  toCents,
  localInput,
  fromLocal,
  displayDate,
  type Movement,
} from '../domain/model';
import { Button, Modal, Field, Kpi, signClass, Empty } from '../components/ui';
export function Bank() {
  const { data, settings, run } = useApp();
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState<Movement['kind']>('Capital inicial'),
    [house, setHouse] = useState(data.houses[0]?.id || ''),
    [destination, setDestination] = useState(''),
    [amount, setAmount] = useState(''),
    [date, setDate] = useState(localInput(timestamp())),
    [note, setNote] = useState(''),
    [reconcile, setReconcile] = useState(''),
    [busy, setBusy] = useState(false);
  const t = totals(data, settings.currency);
  const h = data.houses.find((h) => h.id === house);
  const expected = data.movements
    .filter((m) => m.houseId === house)
    .reduce((a, m) => a + m.amount, 0);
  let discrepancy: number | undefined;
  try {
    if (reconcile) discrepancy = toCents(reconcile) - expected;
  } catch {
    /* input */
  }
  const moves = data.movements
    .filter((m) => data.houses.find((h) => h.id === m.houseId)?.currency === settings.currency)
    .sort((a, b) => b.date.localeCompare(a.date));
  const [page, setPage] = useState(1);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA CÉNTIMO, EN SU SITIO</div>
          <h1>Banca y movimientos</h1>
          <p>Tu capital no es tu beneficio. Aquí los mantenemos separados.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> Nuevo movimiento
        </Button>
      </div>
      <div className="kpi-grid">
        <Kpi
          label="Banca consolidada"
          value={money(t.bank, settings.currency)}
          hint="Disponible + capital comprometido"
          tone="featured"
          icon={<Wallet size={18} />}
        />
        <Kpi
          label="Saldo disponible"
          value={money(t.available, settings.currency)}
          hint="Dinero líquido en tus billeteras"
        />
        <Kpi
          label="Capital comprometido"
          value={money(t.committed, settings.currency)}
          hint="Stake abierto; retorno no garantizado"
        />
        <Kpi
          label="Aportes netos"
          value={money(t.initial + t.deposits - t.withdrawals, settings.currency)}
          hint="Capital + depósitos − retiros"
        />
      </div>
      <div className="wallet-grid">
        {data.houses
          .filter((h) => h.currency === settings.currency)
          .map((h) => (
            <div className="panel wallet" key={h.id}>
              <span className="house-dot">{h.name[0]}</span>
              <div>
                <strong>{h.name}</strong>
                <small>{h.currency}</small>
              </div>
              <strong>
                {money(
                  data.movements
                    .filter((m) => m.houseId === h.id)
                    .reduce((a, m) => a + m.amount, 0),
                  h.currency,
                )}
              </strong>
            </div>
          ))}
      </div>
      <section className="panel reconcile">
        <div>
          <h2>Conciliar una billetera</h2>
          <p>Compara el saldo mostrado por la casa con tu registro.</p>
        </div>
        <div className="form-grid three">
          <Field label="Billetera">
            <select
              value={house}
              onChange={(e) => {
                setHouse(e.target.value);
                setReconcile('');
              }}
            >
              {data.houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} · {h.currency}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Saldo mostrado en la casa">
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={reconcile}
              onChange={(e) => setReconcile(e.target.value)}
            />
          </Field>
          <div className="reconcile-result">
            <small>Saldo contable: {money(expected, h?.currency)}</small>
            <strong className={discrepancy === 0 ? 'positive' : 'warning-text'}>
              {discrepancy === undefined
                ? 'Ingresa el saldo'
                : discrepancy === 0
                  ? 'Saldo conciliado'
                  : `Diferencia: ${money(discrepancy, h?.currency)}`}
            </strong>
          </div>
        </div>
        {discrepancy !== undefined && discrepancy !== 0 && (
          <div className="notice warning">
            Revisa depósitos, retiros y apuestas pendientes de registrar. No se modifica tu saldo
            automáticamente.{' '}
            <button
              className="text-link"
              onClick={() => {
                setKind('Ajuste');
                setAmount(String(discrepancy / 100));
                setNote('');
                setOpen(true);
              }}
            >
              Registrar ajuste con motivo
            </button>
          </div>
        )}
      </section>
      <div className="section-heading outside">
        <h2>Libro de movimientos</h2>
        <span className="muted">
          {moves.length} movimientos · {settings.currency}
        </span>
      </div>
      <section className="panel table-panel">
        {moves.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha · Lima</th>
                    <th>Movimiento</th>
                    <th>Casa</th>
                    <th>Motivo</th>
                    <th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.slice((page - 1) * 15, page * 15).map((m) => (
                    <tr key={m.id}>
                      <td>{displayDate(m.date)}</td>
                      <td>
                        {m.kind === 'Transferencia' && <ArrowRightLeft size={13} />} {m.kind}
                      </td>
                      <td>{data.houses.find((h) => h.id === m.houseId)?.name}</td>
                      <td>{m.note || '—'}</td>
                      <td className={signClass(m.amount)}>{money(m.amount, settings.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Página {page} de {Math.ceil(moves.length / 15)}
              </span>
              <div>
                <Button variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button
                  variant="ghost"
                  disabled={page * 15 >= moves.length}
                  onClick={() => setPage(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title="Configura tu banca inicial"
            description="Registra el capital disponible en cada casa para comenzar."
            action={<Button onClick={() => setOpen(true)}>Registrar capital</Button>}
          />
        )}
      </section>
      {open && (
        <Modal
          title="Registrar movimiento"
          description="Los movimientos se guardan con fecha y auditoría."
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await run(async () => {
                const raw = toCents(amount);
                if (kind !== 'Ajuste' && raw <= 0)
                  throw new Error('El importe debe ser mayor a cero.');
                await repo.move(
                  {
                    id: id(),
                    date: fromLocal(date),
                    houseId: house,
                    kind,
                    amount: kind === 'Retiro' || kind === 'Transferencia' ? -raw : raw,
                    note,
                  },
                  destination,
                );
              });
              setBusy(false);
              if (ok) {
                setOpen(false);
                setAmount('');
                setNote('');
              }
            }}
          >
            <Field label="Tipo de movimiento">
              <select value={kind} onChange={(e) => setKind(e.target.value as Movement['kind'])}>
                {['Capital inicial', 'Depósito', 'Retiro', 'Transferencia', 'Ajuste'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Casa / origen">
              <select value={house} onChange={(e) => setHouse(e.target.value)}>
                {data.houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.currency}
                  </option>
                ))}
              </select>
            </Field>
            {kind === 'Transferencia' && (
              <Field label="Destino">
                <select
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  <option value="">Seleccionar casa</option>
                  {data.houses
                    .filter((x) => x.id !== house && x.currency === h?.currency)
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label={kind === 'Ajuste' ? 'Importe del ajuste (+ o −)' : 'Importe'}>
              <input
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Fecha y hora · Lima">
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field
              label={kind === 'Ajuste' ? 'Motivo del ajuste (obligatorio)' : 'Motivo / referencia'}
            >
              <textarea
                required={kind === 'Ajuste'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="form-footer">
              <span />
              <Button disabled={busy}>Guardar movimiento</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
