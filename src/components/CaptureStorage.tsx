import { useState } from 'react';
import { Cloud } from 'lucide-react';
import { repo } from '../data/repository';
import { useApp } from '../app/context';
import { useLiveQuery } from '../data/useCloudQuery';
import { releasableImages } from '../data/storagePolicy';
import { Button, Modal } from './ui';
const size = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function CaptureStorage() {
  const { data, run } = useApp();
  // Metadata only: opening Settings must not download every capture.
  const images = useLiveQuery(() => repo.database.images.filter(() => true).toArray(), [], []);
  const uploads = useLiveQuery(() => repo.database.uploads.toArray(), [], []);
  const [confirmIds, setConfirmIds] = useState<string[]>(), [busy, setBusy] = useState(false);
  const bytes = images.reduce((sum, i) => sum + (i.bytes ?? 0), 0);
  const saved = images.reduce((sum, i) => sum + Math.max(0, (i.originalBytes ?? i.bytes ?? 0) - (i.bytes ?? 0)), 0);
  const unknown = images.filter(i => i.bytes === undefined).length;
  const releasable = releasableImages(images.map(i => i.id), data.bets, data.settlements, uploads);
  return <section className="panel">
    <div className="section-heading"><h2>Capturas en la nube</h2><Cloud size={20} /></div>
    <div className="storage-metrics">
      <div><strong>{images.length}</strong><span>archivos únicos</span></div>
      <div><strong>{size(bytes)}</strong><span>{unknown ? 'tamaño conocido' : 'almacenados'}</span></div>
      <div><strong>{size(saved)}</strong><span>ahorrados al comprimir</span></div>
    </div>
    {unknown > 0 && <p className="muted">{unknown} capturas anteriores aún no tienen tamaño registrado; no se incluyen en estos importes.</p>}
    <p className="muted">Las nuevas capturas se comprimen sin perder resolución. Los archivos idénticos se comparten entre apuestas.</p>
    <Button variant="secondary" disabled={!releasable.length} onClick={() => setConfirmIds(releasable)}>Liberar capturas de terminadas ({releasable.length})</Button>
    <p className="muted">Conserva las apuestas y sus resultados. Las capturas pendientes o compartidas con apuestas abiertas quedan protegidas.</p>
    {confirmIds && <Modal title="Liberar espacio" description={`Se eliminarán ${confirmIds.length} capturas de apuestas terminadas. Esta acción no se puede deshacer.`} onClose={() => { if (!busy) setConfirmIds(undefined); }}>
      <p>Tu historial, selecciones, banca y resultados se conservan. Puedes descargar antes un respaldo JSON completo desde esta página.</p>
      <div className="form-footer">
        <Button variant="secondary" disabled={busy} onClick={() => setConfirmIds(undefined)}>Cancelar</Button>
        <Button variant="danger" disabled={busy} onClick={async () => {
          setBusy(true);
          try { if (await run(() => repo.removeSettledImages(confirmIds), 'Capturas liberadas')) setConfirmIds(undefined); }
          finally { setBusy(false); }
        }}>{busy ? 'Liberando…' : 'Eliminar capturas'}</Button>
      </div>
    </Modal>}
  </section>;
}
