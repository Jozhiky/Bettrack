import { useEffect, useState } from 'react';
import { useLiveQuery } from '../data/useCloudQuery';
import { repo } from '../data/repository';
import { Modal } from './ui';

function Evidence({ imageId, label }: { imageId: string; label: string }) {
  const image = useLiveQuery(() => repo.database.images.get(imageId), [imageId]);
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image.blob);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  return (
    <figure>
      <figcaption>
        {label}
        <small>{image?.name}</small>
      </figcaption>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Ampliar ${label.toLowerCase()}`}
        >
          <img src={url} alt={label} />
        </a>
      ) : (
        <p>Imagen no disponible.</p>
      )}
    </figure>
  );
}
export function CaptureComparison({
  original,
  incoming,
  onClose,
}: {
  original: string;
  incoming: string;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Comparar capturas"
      description="Comprueba partidos, montos y referencia del boleto. Una coincidencia no prueba que sea la misma operación."
      wide
      onClose={onClose}
    >
      <div className="capture-comparison">
        <Evidence imageId={original} label="Captura registrada" />
        <Evidence imageId={incoming} label="Nueva captura" />
      </div>
      <p className="muted">
        Cierra la comparación para vincularlas o registrar otra apuesta. Puedes pulsar una imagen
        para ampliarla.
      </p>
    </Modal>
  );
}
