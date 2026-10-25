import { useState } from 'react';
import { useApp } from '../app/context';
import { setAutomaticCaptures } from '../data/automaticCapturePolicy';
import { Button } from './ui';
export function AutomaticCaptureSettings() {
  const { settings, run } = useApp(),
    [busy, setBusy] = useState(false);
  const active = !!settings.automaticCaptures;
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await run(
        () => setAutomaticCaptures(!active),
        active
          ? 'Registro automático desactivado'
          : 'Registro automático autorizado para nuevas capturas',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel" aria-label="Registro automático de capturas">
      <h2>Registro automático de capturas</h2>
      <p>
        Sube una captura y guarda las apuestas acreditadas sin editar campos ni confirmar cada lote.
      </p>
      <p>
        Al activarlo autorizas los cargos y retornos de las nuevas capturas de esta cuenta. Solo se
        registran lecturas concordantes y completas; las ambiguas se conservan sin movimientos.
      </p>
      <p>
        Las capturas anteriores a la activación permanecen conservadas. Puedes desactivar el modo
        cuando quieras.
      </p>
      <Button disabled={busy} onClick={() => void toggle()}>
        {active ? 'Desactivar registro automático' : 'Activar y autorizar registro automático'}
      </Button>
    </section>
  );
}
