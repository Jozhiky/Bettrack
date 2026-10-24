import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '../data/useCloudQuery';
import { useApp } from '../app/context';
import { repo } from '../data/repository';
import { enqueueCaptures, linkCapture, reopenHistoricalCapture } from '../data/captures';
import { readDraft, reviewIssues, canReviewCapture } from '../ocr/review';
import { settlementEvidence } from '../ocr/settlement';
import { CaptureReview } from './CaptureReview';
import { money, displayDate, type CaptureUpload } from '../domain/model';
import { Button } from './ui';
import { CaptureComparison } from './CaptureComparison';
import { useCaptureActivity } from '../data/captureActivity';
export function CapturePending({
  upload,
  onSelect,
}: {
  upload: CaptureUpload;
  onSelect: (id: string) => void;
}) {
  const { data, run } = useApp();
  const activity = useCaptureActivity(upload.id);
  const image = useLiveQuery(() => repo.database.images.get(upload.imageId), [upload.imageId]);
  const [url, setUrl] = useState('');
  const [comparing, setComparing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [addingProof, setAddingProof] = useState(false);
  const proofInput = useRef<HTMLInputElement>(null);
  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    setRemoveFailed(false);
    try {
      const removed = await run(() => repo.removePendingCapture(upload.id), 'Captura quitada');
      setRemoveFailed(!removed);
    } finally {
      setRemoving(false);
    }
  };
  useEffect(() => {
    if (!image) return;
    const u = URL.createObjectURL(image.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);
  const bet = data.bets.find((b) => b.id === upload.betId);
  const draft = useMemo(() => readDraft(upload.draftJson), [upload.draftJson]);
  const historical = draft && settlementEvidence(draft);
  const issues = reviewIssues(upload, draft);
  const proof = async (file?: File) => {
    if (!file || addingProof) return;
    setAddingProof(true);
    try {
      await run(async () => {
        const result = await enqueueCaptures([file], repo, undefined, upload.id);
        if (result.failed.length) throw new Error(result.failed[0].error);
      }, 'Comprobante añadido como captura independiente. El borrador original se conserva.');
    } finally {
      setAddingProof(false);
    }
  };
  const sels = data.selections.filter((s) => s.betId === bet?.id),
    house = data.houses.find((h) => h.id === bet?.houseId);
  const retry = () =>
    void run(
      () =>
        repo.database.uploads.update(upload.id, {
          status: 'queued',
          progress: 0,
          reason: '',
          allowDuplicate: false,
          enhanced: true,
          betId: undefined,
        }),
      'Captura en cola',
    );
  return (
    <article className="capture-card capture-pending" data-status={upload.status}>
      <div className="capture-card-header">
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={image?.name || 'Captura original'} loading="lazy" />
          </a>
        )}
        <div>
          <h3>{image?.name || 'Captura'}</h3>
          <p>
            {
              {
                queued: 'En cola',
                processing:
                  activity?.phase === 'saving' ? 'Guardando lectura…' : 'Leyendo captura…',
                review: issues[0]?.title ?? 'Revisión necesaria',
                duplicate: 'Posible duplicado',
                error: 'No se pudo leer',
                saved: 'Apuesta eliminada',
                linked: 'Actualización vinculada',
              }[upload.status]
            }
          </p>
          <small>Fecha de carga: {displayDate(upload.createdAt)}</small>
          {upload.status === 'linked' && (
            <small className="info-tag">Actualización del mismo boleto</small>
          )}
        </div>
      </div>
      {(upload.status === 'queued' || upload.status === 'processing') && (
        <>
          <div className="capture-stage" role="status">
            <span>
              {activity?.phase === 'saving'
                ? 'Guardando lectura para revisión'
                : upload.status === 'queued'
                  ? 'Lista para leer'
                  : 'Reconociendo el boleto'}
            </span>
            <span>{activity?.phase === 'reading' ? `${activity.progress}%` : ''}</span>
          </div>
          <progress
            max={100}
            value={activity?.phase === 'reading' ? activity.progress : undefined}
            aria-label="Progreso de lectura"
          />
        </>
      )}
      {upload.reason && (
        <p className="capture-reason">
          {historical?.candidate && upload.reason.startsWith('El boleto ya muestra estado global')
            ? 'Liquidación detectada. Abre Revisar datos para importar el boleto y su liquidación en una sola operación.'
            : upload.reason}
        </p>
      )}
      {historical?.candidate && (
        <p className="capture-reason">
          Importación histórica · {historical.kind ?? 'Estado por revisar'} · Retorno realizado:{' '}
          {historical.returned === undefined ? 'por confirmar' : money(historical.returned)}
          {!historical.partial && historical.returned !== undefined && draft?.stake !== undefined
            ? ` · Resultado neto: ${money(historical.returned - draft.stake)}`
            : ''}
        </p>
      )}
      {upload.status === 'review' && draft && (
        <details className="ocr-text">
          <summary>Ver datos del boleto · {draft.house || 'Casa no reconocida'}</summary>
          <dl className="capture-review-summary">
            <div>
              <dt>Casa / tipo</dt>
              <dd>
                {draft.house || 'No reconocida'} · {draft.kind || 'No reconocido'}
              </dd>
            </div>
            <div>
              <dt>Importe</dt>
              <dd>{draft.stake !== undefined ? money(draft.stake) : 'No reconocido'}</dd>
            </div>
            <div>
              <dt>Cuota total</dt>
              <dd>{draft.odds ?? 'No reconocida'}</dd>
            </div>
            <div>
              <dt>Retorno potencial</dt>
              <dd>{draft.potential !== undefined ? money(draft.potential) : 'No reconocido'}</dd>
            </div>
            {draft.cashoutOffer !== undefined && (
              <div>
                <dt>Oferta cashout</dt>
                <dd>{money(draft.cashoutOffer)} · no cobrada</dd>
              </div>
            )}
          </dl>
          {draft.selections.map((s, i) => (
            <section className="capture-review-leg" key={i}>
              <strong>
                {i + 1}. {s.event || 'Partido no reconocido'}
              </strong>
              <p>
                {s.market || 'Mercado no reconocido'} · {s.pick || 'Selección no reconocida'} ·
                Cuota {s.odds ?? 'ausente'}
              </p>
              {s.builderMarkets?.map((m, j) => (
                <p key={j}>
                  {m.market || 'Mercado no reconocido'} · {m.pick || 'Selección no reconocida'}
                </p>
              ))}
            </section>
          ))}
        </details>
      )}
      {upload.status === 'review' && (
        <ul className="capture-review-issues">
          {issues.map((issue) => (
            <li key={issue.kind}>
              <strong>{issue.title}</strong>
              <small>{issue.detail}</small>
            </li>
          ))}
        </ul>
      )}
      {upload.status === 'duplicate' && bet && (
        <div className="match-preview">
          <strong>
            {sels[0]?.event || 'Boleto registrado'}
            {sels.length > 1 ? ` +${sels.length - 1}` : ''}
          </strong>
          <small>
            {displayDate(bet.date)} · Apostado {money(bet.stake, house?.currency)} · Cuota{' '}
            {bet.odds.toFixed(2)}
          </small>
          {typeof draft?.cashoutOffer === 'number' && Number.isSafeInteger(draft.cashoutOffer) && (
            <small>
              Nueva oferta cashout: {money(draft.cashoutOffer, house?.currency)} · no cobrada
            </small>
          )}
          <small>Vincular conserva ambas capturas y no modifica el resultado.</small>
          {bet.imageId && (
            <Button variant="secondary" onClick={() => setComparing(true)}>
              Comparar capturas
            </Button>
          )}
        </div>
      )}
      {['review', 'error'].includes(upload.status) && typeof draft?.text === 'string' && (
        <details className="ocr-text">
          <summary>Ver texto reconocido</summary>
          <pre>{draft.text}</pre>
        </details>
      )}
      <div className="quick-results">
        {['review', 'error'].includes(upload.status) && (
          <>
            <Button variant="secondary" disabled={removing || addingProof} onClick={() => retry()}>
              Mejorar lectura
            </Button>
            <Button
              variant="secondary"
              disabled={removing || addingProof}
              onClick={() => proofInput.current?.click()}
            >
              {addingProof ? 'Añadiendo…' : 'Añadir comprobante de apuesta'}
            </Button>
            <input
              ref={proofInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              aria-label="Seleccionar comprobante de apuesta"
              onChange={(e) => {
                void proof(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {draft &&
              canReviewCapture(draft) &&
              (upload.status === 'review' || historical?.candidate) && (
                <Button
                  disabled={removing || addingProof}
                  onClick={async () => {
                    if (
                      upload.status === 'error' &&
                      !(await run(() => reopenHistoricalCapture(upload.id)))
                    )
                      return;
                    setReviewing(true);
                  }}
                >
                  Revisar datos
                </Button>
              )}
            <small>
              Mejorar lectura usa la misma imagen. Añadir comprobante conserva este borrador y lee
              una nueva captura; no confirma ni combina importes automáticamente.
            </small>
          </>
        )}
        {upload.status === 'duplicate' && (
          <>
            {bet && (
              <>
                <Button
                  disabled={removing}
                  onClick={() =>
                    void run(
                      () => linkCapture(upload.id),
                      'Captura vinculada. El stake no se duplicó.',
                    )
                  }
                >
                  Es el mismo boleto
                </Button>
                <Button variant="ghost" onClick={() => onSelect(bet.id)}>
                  Ver apuesta existente
                </Button>
              </>
            )}
          </>
        )}
        {['queued', 'processing', 'review', 'error', 'duplicate'].includes(upload.status) && (
          <Button
            variant="ghost"
            disabled={removing}
            aria-busy={removing}
            onClick={() => void remove()}
          >
            {removing ? 'Quitando…' : 'Quitar captura'}
          </Button>
        )}
      </div>
      {removeFailed && (
        <p className="field-error" role="alert">
          No se pudo quitar la captura. Sigue guardada; revisa tu conexión y vuelve a intentarlo.
        </p>
      )}
      {comparing && bet?.imageId && (
        <CaptureComparison
          original={bet.imageId}
          incoming={upload.imageId}
          onClose={() => setComparing(false)}
        />
      )}
      {reviewing && (
        <CaptureReview upload={upload} imageUrl={url} onClose={() => setReviewing(false)} />
      )}
    </article>
  );
}
