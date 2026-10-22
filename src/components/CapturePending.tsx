import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from '../data/useCloudQuery';
import { useApp } from '../app/context';
import { repo } from '../data/repository';
import { linkCapture } from '../data/captures';
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
  const draft = useMemo(() => {
    try {
      return JSON.parse(upload.draftJson) as {
        cashoutOffer?: number;
        potential?: number;
        text?: string;
      };
    } catch {
      return undefined;
    }
  }, [upload.draftJson]);
  const sels = data.selections.filter((s) => s.betId === bet?.id),
    house = data.houses.find((h) => h.id === bet?.houseId);
  const retry = (allowDuplicate = false) =>
    void run(
      () =>
        repo.database.uploads.update(upload.id, {
          status: 'queued',
          progress: 0,
          reason: '',
          allowDuplicate,
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
                processing: activity?.phase === 'saving' ? 'Guardando apuesta…' : 'Leyendo captura…',
                review: 'Necesita otra captura',
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
          <div className="capture-stage" role="status"><span>{activity?.phase === 'saving' ? 'Confirmando en Supabase' : upload.status === 'queued' ? 'Lista para leer' : 'Reconociendo el boleto'}</span><span>{activity?.phase === 'reading' ? `${activity.progress}%` : ''}</span></div>
          <progress max={100} value={activity?.phase === 'reading' ? activity.progress : undefined} aria-label="Progreso de lectura" />
        </>
      )}
      {upload.reason && <p className="capture-reason">{upload.reason}</p>}
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
          <Button variant="secondary" disabled={removing} onClick={() => retry()}>
            Mejorar lectura
          </Button>
        )}
        {upload.status === 'duplicate' && (
          <>
            <Button variant="secondary" disabled={removing} onClick={() => retry(true)}>
              Registrar como otra apuesta
            </Button>
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
    </article>
  );
}
