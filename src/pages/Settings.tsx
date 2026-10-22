import { useRef, useState } from 'react';
import { Download, Upload, HardDrive, ShieldCheck, Cloud } from 'lucide-react';
import { useApp } from '../app/context';
import { repo } from '../data/repository';
import {
  createBackup,
  restoreBackup,
  validateBackup,
  parseCSV,
  exportCSV,
  download,
  type Backup,
  type ImportDraft,
} from '../data/transfer';
import { displayDate, toCents } from '../domain/model';
import { Button, Field, Modal } from '../components/ui';
import { BetForm } from '../components/BetForm';
import { CaptureStorage } from '../components/CaptureStorage';
export function Settings() {
  const { data, settings, run, notify } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<ImportDraft[]>([]),
    [draftIndex, setDraftIndex] = useState(0),
    [backup, setBackup] = useState<Backup>(),
    [exposure, setExposure] = useState(String(settings.exposureLimit / 100)),
    [loss, setLoss] = useState(String(settings.lossLimit / 100)),
    [auditPage, setAuditPage] = useState(1);
  const draft = drafts[draftIndex];
  const audit = [...data.audit].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU ESPACIO, TUS REGLAS</div>
          <h1>Configuración</h1>
          <p>Controla tus datos, tu exposición y la experiencia de BETTRACK.</p>
        </div>
        <span className="local-tag">
          <HardDrive size={15} /> Cuenta cloud
        </span>
      </div>
      <div className="settings-grid">
        <CaptureStorage />
        <section className="panel">
          <div className="section-heading">
            <h2>Preferencias</h2>
          </div>
          <Field label="Apariencia">
            <select
              value={settings.theme}
              onChange={(e) =>
                void run(() =>
                  repo.database.settings.put({
                    ...settings,
                    theme: e.target.value as 'light' | 'dark',
                  }),
                )
              }
            >
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </Field>
          <Field
            label="Moneda de visualización"
            hint="Cada moneda se calcula por separado. No se convierten ni mezclan saldos."
          >
            <select
              value={settings.currency}
              onChange={(e) =>
                void run(() =>
                  repo.database.settings.put({
                    ...settings,
                    currency: e.target.value as typeof settings.currency,
                  }),
                )
              }
            >
              {['PEN', 'USD', 'EUR'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div className="list-row">
            <span>Idioma</span>
            <strong>Español · Perú</strong>
          </div>
          <div className="list-row">
            <span>Zona horaria</span>
            <strong>America/Lima</strong>
          </div>
          <p className="muted">Las fechas del registro se muestran como DD/MM/YYYY.</p>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Límites y alertas</h2>
            <ShieldCheck size={19} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const exposureLimit = toCents(exposure),
                  lossLimit = toCents(loss);
                if (exposureLimit < 0 || lossLimit < 0)
                  throw new Error('Los límites no pueden ser negativos.');
                await repo.database.settings.put({ ...settings, exposureLimit, lossLimit });
              });
            }}
          >
            <Field
              label={`Límite de exposición · ${settings.currency}`}
              hint="Alerta cuando el stake abierto supera este importe."
            >
              <input
                inputMode="decimal"
                required
                value={exposure}
                onChange={(e) => setExposure(e.target.value)}
              />
            </Field>
            <Field label={`Alerta de pérdidas acumuladas · ${settings.currency}`}>
              <input
                inputMode="decimal"
                required
                value={loss}
                onChange={(e) => setLoss(e.target.value)}
              />
            </Field>
            <p className="muted">
              Las alertas son informativas. BETTRACK no coloca apuestas ni garantiza retornos.
            </p>
            <Button variant="secondary">Guardar límites</Button>
          </form>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Tus datos te pertenecen</h2>
              <p>Exporta, importa o conserva una copia completa.</p>
            </div>
            <Download size={20} />
          </div>
          <div className="backup-actions">
            <Button
              variant="secondary"
              onClick={() =>
                void run(
                  async () =>
                    download(
                      `bettrack-respaldo-${new Date().toISOString().slice(0, 10)}.json`,
                      JSON.stringify(await createBackup(), null, 2),
                    ),
                  'Respaldo JSON generado',
                )
              }
            >
              <Download size={16} /> Respaldo JSON completo
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                download('bettrack-apuestas.csv', exportCSV(data), 'text/csv;charset=utf-8');
                notify('Historial CSV exportado');
              }}
            >
              <Download size={16} /> Historial CSV
            </Button>
            <Button variant="secondary" onClick={() => file.current?.click()}>
              <Upload size={16} /> Importar CSV / JSON
            </Button>
          </div>
          <input
            ref={file}
            type="file"
            accept=".csv,.json"
            hidden
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              e.target.value = '';
              if (!selected) return;
              if (selected.size > 100 * 1024 * 1024) {
                notify('El archivo excede el límite de 100 MB.', true);
                return;
              }
              try {
                const text = await selected.text();
                if (selected.name.toLowerCase().endsWith('.json'))
                  setBackup(validateBackup(JSON.parse(text)));
                else {
                  const rows = parseCSV(text);
                  setDrafts(rows);
                  setDraftIndex(0);
                  if (!rows.length) notify('El archivo no contiene filas.', true);
                }
              } catch (err) {
                notify(err instanceof Error ? err.message : String(err), true);
              }
            }}
          />
          <p className="muted">
            El respaldo JSON incluye apuestas, selecciones, liquidaciones, movimientos, auditoría y
            capturas. El CSV incluye el historial y se revisa fila a fila.
          </p>
          <details>
            <summary>Columnas de Google Sheets reconocidas</summary>
            <p>
              Apuesta, Monto apostado, Cuota, Monto cashout, Estado, Resultado y Fecha. También
              Casa, Moneda, Mercado y Selección. Exporta tu hoja como CSV y súbela aquí.
            </p>
            <p>
              Resultado se interpreta como beneficio neto. Los cashouts solo se importan como
              ejecutados cuando el estado es Cashout y confirmas la fila.
            </p>
          </details>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Almacenamiento y conexiones</h2>
            <Cloud size={20} />
          </div>
          <span className="info-tag">Supabase · cuenta privada</span>
          <p>Tus apuestas, banca, preferencias y capturas se guardan en Supabase y están disponibles al iniciar sesión desde otro dispositivo.</p>
          <p>Se necesita conexión para guardar cambios. El OCR procesa la imagen en tu navegador y la captura se almacena en un bucket privado de tu cuenta.</p>
          <p className="muted">Solo la sesión de acceso utiliza una cookie. No guardamos tus registros en localStorage ni IndexedDB.</p>
        </section>
      </div>
      <section className="panel audit-panel">
        <div className="section-heading">
          <h2>Historial auditable</h2>
          <span className="muted">{audit.length} eventos</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha · Lima</th>
                <th>Acción</th>
                <th>Referencia</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice((auditPage - 1) * 10, auditPage * 10).map((a) => (
                <tr key={a.id}>
                  <td>{displayDate(a.date)}</td>
                  <td>{a.action}</td>
                  <td>
                    <code>{a.entityId.slice(0, 12)}</code>
                  </td>
                  <td>
                    <details>
                      <summary>Ver cambio</summary>
                      <pre>
                        {JSON.stringify(
                          { antes: JSON.parse(a.before), despues: JSON.parse(a.after) },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>Historial de tu cuenta. Los cambios se auditan también en el servidor.</span>
          <div>
            <Button
              variant="ghost"
              disabled={auditPage === 1}
              onClick={() => setAuditPage(auditPage - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="ghost"
              disabled={auditPage * 10 >= audit.length}
              onClick={() => setAuditPage(auditPage + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </section>
      {backup && (
        <Modal title="Revisar respaldo JSON" onClose={() => setBackup(undefined)}>
          <p>
            {backup.data.bets.length} apuestas, {backup.data.movements.length} movimientos y{' '}
            {backup.images.length} capturas.
          </p>
          <p>
            Se fusionarán registros nuevos y se restaurarán las preferencias. Los registros
            idénticos se omiten. Si un ID existente tiene cambios, la operación se cancela
            íntegramente.
          </p>
          <div className="notice warning">
            Se conservarán todos los registros actuales. No se reemplaza la base.
          </div>
          <Button
            onClick={() =>
              void run(() => restoreBackup(backup), 'Respaldo restaurado').then(
                (ok) => ok && setBackup(undefined),
              )
            }
          >
            Confirmar restauración
          </Button>
        </Modal>
      )}
      {draft && (
        <Modal
          title={`Revisar importación · ${draftIndex + 1} de ${drafts.length}`}
          description={`Estado original: ${draft.status || 'no reconocido'} · Casa: ${draft.house || 'sin identificar'}`}
          onClose={() => setDrafts([])}
          wide
        >
          <BetForm
            key={draftIndex}
            initial={{
              ...draft.bet,
              houseId: data.houses.find(
                (h) =>
                  h.name.toLowerCase() === draft.house?.toLowerCase() &&
                  (!draft.currency || h.currency === draft.currency),
              )?.id,
            }}
            selections={draft.selections}
            settlements={draft.settlements}
            needsDate={!draft.bet.date}
            warnings={[
              ...draft.warnings,
              `Confirma casa y moneda${draft.currency ? `: ${draft.currency}` : ''}. Necesitas saldo disponible para importar el stake.`,
            ]}
            onDone={() => {
              if (draftIndex + 1 >= drafts.length) setDrafts([]);
              else setDraftIndex(draftIndex + 1);
            }}
          />
          <Button
            variant="ghost"
            onClick={() => {
              if (draftIndex + 1 >= drafts.length) setDrafts([]);
              else setDraftIndex(draftIndex + 1);
            }}
          >
            Omitir esta fila
          </Button>
        </Modal>
      )}
    </>
  );
}
