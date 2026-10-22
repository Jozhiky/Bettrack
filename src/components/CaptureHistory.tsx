import { useEffect, useState } from 'react';
import { useLiveQuery } from '../data/useCloudQuery';
import { repo } from '../data/repository';
import { useApp } from '../app/context';
import { displayDate, money, type CaptureUpload } from '../domain/model';
import { Button } from './ui';
function HistoricalImage({ upload }: { upload: CaptureUpload }) {
  const { run } = useApp();
  const [expanded, setExpanded] = useState(false);
  const image = useLiveQuery(() => expanded ? repo.database.images.get(upload.imageId) : Promise.resolve(undefined), [upload.imageId, expanded]);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!image) return;
    const u = URL.createObjectURL(image.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);
  let offer: number | undefined;
  try {
    const p = JSON.parse(upload.draftJson);
    if (Number.isSafeInteger(p.cashoutOffer) && p.cashoutOffer >= 0) offer = p.cashoutOffer;
  } catch {
    /* Older uploads may have no OCR cache. */
  }
  return (
    <details className="capture-history-item" onToggle={e => setExpanded(e.currentTarget.open)}>
      <summary>
        Captura del {displayDate(upload.createdAt)}
        {offer !== undefined ? ` · Oferta cashout ${money(offer)}` : ''}
      </summary>
      <p className="muted">Referencia visual. No confirma un cobro ni cambia el resultado.</p>
      {url && <img className="ticket-image" src={url} alt="Actualización del boleto" />}
      <Button
        variant="danger"
        onClick={() => {
          if (confirm('¿Eliminar esta captura vinculada? La apuesta se conserva.'))
            void run(() => repo.removeLinkedCapture(upload.id));
        }}
      >
        Eliminar esta actualización
      </Button>
    </details>
  );
}
export function CaptureHistory({ betId }: { betId: string }) {
  const uploads =
    useLiveQuery(
      () =>
        repo.database.uploads
          .where('betId')
          .equals(betId)
          .filter((u) => u.status === 'linked')
          .sortBy('createdAt'),
      [betId],
    ) ?? [];
  return uploads.length ? (
    <section>
      <h3>Seguimiento · {uploads.length} actualizaciones</h3>
      {uploads.map((u) => (
        <HistoricalImage key={u.id} upload={u} />
      ))}
    </section>
  ) : null;
}
