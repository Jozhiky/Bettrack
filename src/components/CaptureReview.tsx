import { useState } from 'react';
import type { CaptureUpload } from '../domain/model';
import { money, displayDate } from '../domain/model';
import { confirmCaptureReview } from '../data/captures';
import { readDraft, needsNewProof, reviewSelectionSchema, draftSettlement } from '../ocr/review';
import { useApp } from '../app/context';
import { Button, Field, Modal } from './ui';

export function CaptureReview({
  upload,
  imageUrl,
  onClose,
}: {
  upload: CaptureUpload;
  imageUrl: string;
  onClose: () => void;
}) {
  const { run } = useApp();
  const [snapshot] = useState(() => upload);
  const [original] = useState(() => readDraft(upload.draftJson));
  const [rows, setRows] = useState(() => structuredClone(original?.selections ?? []));
  const [preview, setPreview] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const settled = original && draftSettlement(original);
  const stale =
    upload.draftJson !== snapshot.draftJson ||
    upload.imageId !== snapshot.imageId ||
    upload.status !== 'review';
  const valid =
    !stale &&
    original &&
    !settled &&
    !needsNewProof(original) &&
    original.house &&
    original.kind &&
    original.stake !== undefined &&
    original.odds !== undefined &&
    original.potential !== undefined &&
    rows.length > 0 &&
    (!original.expectedSelections || original.expectedSelections === rows.length) &&
    rows.every((s) => s.odds !== null && reviewSelectionSchema.safeParse(s).success);
  const change = (i: number, field: 'event' | 'market' | 'pick' | 'odds', value: string) => {
    setRows(
      rows.map((s, n) =>
        n !== i
          ? s
          : {
              ...s,
              [field]:
                field === 'odds' ? (value === '' ? null : Number(value.replace(',', '.'))) : value,
            },
      ),
    );
  };
  const save = async () => {
    if (!valid || !accepted || busy) return;
    setBusy(true);
    try {
      const done = await run(
        () =>
          confirmCaptureReview(snapshot.id, {
            expectedDraft: snapshot.draftJson,
            imageId: snapshot.imageId,
            selections: rows,
            acknowledged: accepted,
          }),
        'Revisión procesada',
      );
      if (done) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={preview ? 'Confirmar registro de apuesta' : 'Revisar datos de la captura'}
      description="La captura original se conserva y las correcciones quedan en el historial de auditoría."
      onClose={onClose}
      wide
      detail
    >
      <div className="capture-review-layout">
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer">
            <img
              className="capture-review-image"
              src={imageUrl}
              alt="Captura original para cotejar datos"
            />
          </a>
        )}
        <div>
          <dl className="capture-review-summary">
            <div>
              <dt>Casa</dt>
              <dd>{original?.house ?? 'No reconocida'}</dd>
            </div>
            <div>
              <dt>Monto apostado</dt>
              <dd>{original?.stake !== undefined ? money(original.stake) : 'No reconocido'}</dd>
            </div>
            <div>
              <dt>Cuota total</dt>
              <dd>{original?.odds ?? 'No reconocida'}</dd>
            </div>
            <div>
              <dt>Retorno potencial</dt>
              <dd>
                {original?.potential !== undefined ? money(original.potential) : 'No reconocido'}
              </dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{original?.kind ?? 'No reconocido'}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                {settled
                  ? `${settled} · liquidado, registro retenido`
                  : 'En revisión · registro inicial Pendiente'}
              </dd>
            </div>
            {original?.cashoutOffer !== undefined && (
              <div>
                <dt>Oferta cashout</dt>
                <dd>{money(original.cashoutOffer)} · no cobrada</dd>
              </div>
            )}
            <div>
              <dt>Fecha de registro</dt>
              <dd>{displayDate(snapshot.createdAt)} · fecha de carga</dd>
            </div>
            <div>
              <dt>Modalidad / atribución</dt>
              <dd>Modalidad no reconocida · Sin atribución</dd>
            </div>
            {original?.bonusAmount !== undefined && (
              <div>
                <dt>Bono mostrado</dt>
                <dd>{money(original.bonusAmount)} · Sin confirmar</dd>
              </div>
            )}
          </dl>
          <p className="capture-reason">
            {settled ? (
              'Boleto ya liquidado. El registro como pendiente está bloqueado; revisa su liquidación por separado.'
            ) : (
              <>
                Se registrará Pendiente y se reservará{' '}
                {original?.stake !== undefined ? money(original.stake) : 'el stake'}. El retorno es
                potencial; ningún cashout se cobrará automáticamente.
              </>
            )}
          </p>
          {rows.map((s, i) => (
            <section className="capture-review-leg" key={i}>
              <h3>Partido {i + 1}</h3>
              {preview ? (
                <>
                  <strong>{s.event}</strong>
                  <p>
                    {s.market} · {s.pick} · Cuota {s.odds}
                  </p>
                </>
              ) : (
                <>
                  <Field label={`Evento ${i + 1}`}>
                    <input
                      value={s.event}
                      maxLength={250}
                      onChange={(e) => change(i, 'event', e.target.value)}
                    />
                  </Field>
                  <Field label={`Mercado ${i + 1}`}>
                    <input
                      value={s.market}
                      maxLength={250}
                      onChange={(e) => change(i, 'market', e.target.value)}
                    />
                  </Field>
                  <Field label={`Selección ${i + 1}`}>
                    <input
                      value={s.pick}
                      maxLength={250}
                      onChange={(e) => change(i, 'pick', e.target.value)}
                    />
                  </Field>
                  <Field label={`Cuota ${i + 1}`}>
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      step="any"
                      value={s.odds ?? ''}
                      onChange={(e) => change(i, 'odds', e.target.value)}
                    />
                  </Field>
                </>
              )}
              {s.promotion && <p className="muted">{s.promotion} · no acredita cobro</p>}
              {s.builderMarkets?.map((m, j) =>
                preview ? (
                  <p key={j}>
                    {j + 1}. {m.market} · {m.pick}
                    {m.promotion ? ` · ${m.promotion} (no acredita cobro)` : ''}
                  </p>
                ) : (
                  <div className="capture-review-child" key={j}>
                    <Field label={`Mercado ${i + 1}.${j + 1}`}>
                      <input
                        value={m.market}
                        maxLength={250}
                        onChange={(e) =>
                          setRows(
                            rows.map((row, n) =>
                              n === i
                                ? {
                                    ...row,
                                    builderMarkets: row.builderMarkets?.map((child, k) =>
                                      k === j ? { ...child, market: e.target.value } : child,
                                    ),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={`Selección ${i + 1}.${j + 1}`}>
                      <input
                        value={m.pick}
                        maxLength={250}
                        onChange={(e) =>
                          setRows(
                            rows.map((row, n) =>
                              n === i
                                ? {
                                    ...row,
                                    builderMarkets: row.builderMarkets?.map((child, k) =>
                                      k === j ? { ...child, pick: e.target.value } : child,
                                    ),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    {m.promotion && <p className="muted">{m.promotion} · no acredita cobro</p>}
                  </div>
                ),
              )}
            </section>
          ))}
          <p className="muted">
            Las etiquetas no clasificadas se guardarán literalmente como cotejadas por ti. No se
            inferirán equipo, jugador ni período.
          </p>
          {error && <p role="alert">{error}</p>}
          {stale && (
            <p role="alert">
              El borrador cambió. Cierra y vuelve a abrir la revisión para cotejar los datos
              actuales.
            </p>
          )}
          {preview ? (
            <>
              <label className="capture-review-consent">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />{' '}
                He cotejado cada selección y cuota con la imagen y confirmo que la apuesta ya está
                colocada.
              </label>
              <div className="quick-results">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setPreview(false);
                    setAccepted(false);
                  }}
                >
                  Volver a corregir
                </Button>
                <Button disabled={!accepted || !valid || busy} onClick={() => void save()}>
                  {busy ? 'Guardando…' : 'Confirmar y registrar apuesta'}
                </Button>
              </div>
            </>
          ) : (
            <Button
              disabled={!!settled}
              onClick={() => {
                if (!valid) {
                  setError(
                    'Faltan datos válidos o comprobante de colocación. No inventes información: añade una captura completa si no es visible.',
                  );
                  return;
                }
                setError('');
                setPreview(true);
              }}
            >
              Ver resumen antes de registrar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
