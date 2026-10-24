import { useEffect, useState } from 'react';
import type { CaptureUpload } from '../domain/model';
import { money } from '../domain/model';
import { readDraft } from '../ocr/review';
import { settlementEvidence } from '../ocr/settlement';
import { repo } from '../data/repository';
import { useLiveQuery } from '../data/useCloudQuery';
import { CaptureReview } from './CaptureReview';
import { reopenHistoricalCapture } from '../data/captures';
import { useApp } from '../app/context';
import { Button } from './ui';
import { AutomaticCaptureBatch } from './AutomaticCaptureBatch';

function ReviewExisting({ upload, onClose }: { upload: CaptureUpload; onClose: () => void }) {
  const image = useLiveQuery(() => repo.database.images.get(upload.imageId), [upload.imageId]);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!image) return;
    const value = URL.createObjectURL(image.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [image]);
  if (!url)
    return (
      <p role="status">
        Recuperando la imagen original…{' '}
        <Button variant="ghost" onClick={onClose}>
          Cancelar revisión
        </Button>
      </p>
    );
  return <CaptureReview upload={upload} imageUrl={url} onClose={onClose} />;
}
export function HistoricalCaptureInbox({ uploads }: { uploads: CaptureUpload[] }) {
  const { run } = useApp();
  const [selected, setSelected] = useState<string>();
  const rows = uploads
    .filter((u) => ['review', 'error'].includes(u.status))
    .flatMap((upload) => {
      const draft = readDraft(upload.draftJson);
      if (!draft) return [];
      const evidence = settlementEvidence(draft);
      return evidence.candidate ? [{ upload, draft, evidence }] : [];
    });
  const current = rows.find((row) => row.upload.id === selected);
  if (!rows.length) return null;
  return (
    <>
      <AutomaticCaptureBatch uploads={uploads} />
      <section className="notice" aria-label="Importación de históricas">
        <details>
          <summary>Históricas en revisión ({rows.length}) · recuperar sin volver a subir</summary>
          <p>
            Abre cada boleto y coteja su resumen. Cada importación requiere su propio
            consentimiento; los ambiguos pueden quedarse en revisión.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Estado detectado</th>
                  <th>Partido</th>
                  <th>Stake</th>
                  <th>Retorno realizado</th>
                  <th>Resultado neto</th>
                  <th>Revisión</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ upload, draft, evidence }) => (
                  <tr key={upload.id} data-upload-id={upload.id}>
                    <td>
                      {evidence.kind ?? 'Ambiguo'}
                      {evidence.partial ? ' · parcial' : ''}
                    </td>
                    <td>
                      {draft.selections[0]?.event || 'Sin reconocer'}
                      {draft.selections.length > 1 ? ` +${draft.selections.length - 1}` : ''}
                    </td>
                    <td>{draft.stake === undefined ? 'Por confirmar' : money(draft.stake)}</td>
                    <td>
                      {evidence.returned === undefined ? 'Por confirmar' : money(evidence.returned)}
                    </td>
                    <td>
                      {evidence.partial ||
                      evidence.returned === undefined ||
                      draft.stake === undefined
                        ? 'Por confirmar'
                        : money(evidence.returned - draft.stake)}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        aria-label={`Revisar histórica ${draft.selections[0]?.event || upload.id}`}
                        onClick={async () => {
                          if (
                            upload.status === 'error' &&
                            !(await run(() => reopenHistoricalCapture(upload.id)))
                          )
                            return;
                          setSelected(upload.id);
                        }}
                      >
                        Revisar e importar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        {current && (
          <ReviewExisting
            key={current.upload.id}
            upload={current.upload}
            onClose={() => setSelected(undefined)}
          />
        )}
      </section>
    </>
  );
}
