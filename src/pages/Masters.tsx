import { useState } from 'react';
import { Plus, Building2, Radio, ExternalLink } from 'lucide-react';
import { useApp } from '../app/context';
import { repo } from '../data/repository';
import { masterSchema, id, money, position, type Master } from '../domain/model';
import { Button, Modal, Field, Empty, signClass } from '../components/ui';
export function Masters({ type }: { type: 'houses' | 'streamers' }) {
  const { data, run } = useApp();
  const [editing, setEditing] = useState<Master>();
  const isHouse = type === 'houses';
  const entries = data[type];
  const update = (key: keyof Master, value: string | boolean) =>
    setEditing((e) => (e ? { ...e, [key]: value } : e));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ORGANIZA TU ACTIVIDAD</div>
          <h1>{isHouse ? 'Casas de apuestas' : 'Streamers'}</h1>
          <p>
            {isHouse
              ? 'Una billetera por casa. Cada moneda se calcula por separado.'
              : 'Sigue el rendimiento de tus fuentes. La atribución siempre es tuya.'}
          </p>
        </div>
        <Button
          onClick={() =>
            setEditing({
              ...masterSchema.parse({ id: id(), name: 'Nuevo registro', active: true }),
              name: '',
            })
          }
        >
          <Plus size={16} /> {isHouse ? 'Nueva casa' : 'Nuevo streamer'}
        </Button>
      </div>
      {!entries.length ? (
        <Empty
          title="Crea tu primer registro"
          description="Podrás editarlo o desactivarlo en cualquier momento."
        />
      ) : (
        <div className="master-grid">
          {entries.map((m) => {
            const bets = data.bets.filter((b) =>
              isHouse ? b.houseId === m.id : b.streamerId === m.id,
            );
            const balance = data.movements
              .filter((x) => x.houseId === m.id)
              .reduce((a, x) => a + x.amount, 0);
            const currencyBets = bets.filter(
              (b) => data.houses.find((h) => h.id === b.houseId)?.currency === m.currency,
            );
            const profit = currencyBets.reduce(
              (a, b) => a + position(b, data.settlements).profit,
              0,
            );
            const closed = currencyBets.reduce(
              (a, b) => a + position(b, data.settlements).closed,
              0,
            );
            return (
              <section className="panel master-card" key={m.id}>
                <div className="section-heading">
                  <div className="master-icon">{isHouse ? <Building2 /> : <Radio />}</div>
                  <span className="mini-label">{m.active ? 'ACTIVO' : 'INACTIVO'}</span>
                </div>
                <h2>{m.name}</h2>
                <p>
                  {isHouse
                    ? `Billetera ${m.currency}`
                    : [m.platform, m.channel].filter(Boolean).join(' · ') ||
                      'Sin plataforma configurada'}
                </p>
                <div className="master-amount">
                  <small>{isHouse ? 'Saldo disponible' : `Resultado · ${m.currency}`}</small>
                  <strong className={isHouse ? '' : signClass(profit)}>
                    {money(isHouse ? balance : profit, m.currency)}
                  </strong>
                </div>
                <div className="mini-metrics">
                  <span>{bets.length} apuestas</span>
                  <span>
                    Yield <strong>{closed ? ((profit / closed) * 100).toFixed(2) : '0.00'}%</strong>
                  </span>
                </div>
                {m.notes && <small className="muted">{m.notes}</small>}
                <div className="form-footer">
                  {m.url && /^https?:\/\//i.test(m.url) ? (
                    <a className="text-link" href={m.url} target="_blank" rel="noreferrer">
                      Canal <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span />
                  )}
                  <Button variant="secondary" onClick={() => setEditing(m)}>
                    Editar
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}
      {editing && (
        <Modal
          title={isHouse ? 'Casa de apuestas' : 'Streamer / pronosticador'}
          onClose={() => setEditing(undefined)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => repo.saveMaster(type, editing))) setEditing(undefined);
            }}
          >
            <Field label="Nombre">
              <input
                required
                value={editing.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </Field>
            <Field label={isHouse ? 'Moneda de la billetera' : 'Moneda de estadísticas'}>
              <select value={editing.currency} onChange={(e) => update('currency', e.target.value)}>
                {['PEN', 'USD', 'EUR'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {!isHouse && (
              <>
                <Field label="Plataforma">
                  <input
                    value={editing.platform}
                    onChange={(e) => update('platform', e.target.value)}
                  />
                </Field>
                <Field label="Canal o usuario">
                  <input
                    value={editing.channel}
                    onChange={(e) => update('channel', e.target.value)}
                  />
                </Field>
                <Field label="URL (https://)">
                  <input
                    type="url"
                    value={editing.url}
                    onChange={(e) => update('url', e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field label="Observaciones">
              <textarea value={editing.notes} onChange={(e) => update('notes', e.target.value)} />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => update('active', e.target.checked)}
              />{' '}
              Activo
            </label>
            <div className="form-footer">
              {entries.some((m) => m.id === editing.id) && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    if (
                      confirm(
                        '¿Eliminar este registro? Solo se permite si no tiene operaciones vinculadas.',
                      )
                    )
                      void run(() => repo.deleteMaster(type, editing.id)).then(
                        (ok) => ok && setEditing(undefined),
                      );
                  }}
                >
                  Eliminar
                </Button>
              )}
              <Button>Guardar</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
