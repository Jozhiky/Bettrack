import { useMemo, useRef, useState } from 'react';
import { useApp } from '../app/context';
import { money, displayDate, timestamp, emptySnapshot, type CaptureUpload } from '../domain/model';
import { previewAutomaticBatch } from '../ocr/automaticImport';
import { confirmAutomaticBatch, type AutomaticBatchItem } from '../data/captures';
import { Button } from './ui';

export function AutomaticCaptureBatch({ uploads }: { uploads: CaptureUpload[] }) {
  const { run, data } = useApp();
  const [recordedAt, setRecordedAt] = useState(timestamp);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const lock = useRef(false);
  const { rows, ready } = useMemo(() => previewAutomaticBatch(uploads, recordedAt, data ?? emptySnapshot, excluded), [uploads, recordedAt, data, excluded]);
  if (!rows.some((r) => r.evidence?.candidate)) return null;
  const financial = ready.filter((r) => r.expectedOutcome === 'saved');
  const stake = financial.reduce((n, r) => n + r.historical!.closedStake, 0);
  const returned = financial.reduce((n, r) => n + r.historical!.returned, 0);
  const confirm = async () => {
    if (lock.current || !ready.length) return;
    lock.current = true;
    setBusy(true);
    setResult('');
    const items: AutomaticBatchItem[] = ready.map((r) => ({
      uploadId: r.upload.id,
      expectedOutcome: r.expectedOutcome!,
      confirmation: {
        expectedDraft: r.upload.draftJson,
        imageId: r.upload.imageId,
        selections: r.draft!.selections,
        acknowledged: true,
        historical: r.historical,
      },
    }));
    try {
      await run(async () => {
        const r = await confirmAutomaticBatch(items, true);
        setResult(`${r.saved} registradas · ${r.duplicates} duplicadas sin cargo adicional.`);
      }, 'Lote guardado en Supabase');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      className="panel automatic-capture-batch"
      aria-label="Importación automática de liquidadas"
    >
      <h2>Liquidadas listas para registrar</h2>
      <p>
        Estado, cobro y cuotas preparados desde el boleto. No necesitas completar fechas ni abrir
        cada captura.
      </p>
      <p className="muted">
        La fecha del partido se conserva por separado. Si no aparece cuándo apostaste o cobraste,
        esas fechas quedan desconocidas; el movimiento se registra al confirmar. «Hoy» y «mañana»
        usan el día de carga como referencia, no como prueba de una fecha histórica.
      </p>
      <div className="table-wrap" tabIndex={0} aria-label="Resumen del lote">
        <table>
          <thead>
            <tr>
              <th>Incluir</th>
              <th>Boleto / selecciones</th>
              <th>Estado</th>
              <th>Stake</th>
              <th>Cobrado</th>
              <th>Neto</th>
              <th>Partido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.upload.id} data-batch-upload={r.upload.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Incluir ${r.draft?.selections[0]?.event ?? 'boleto'}`}
                    disabled={
                      busy ||
                      !r.historical ||
                      (ready.length === 25 &&
                        !ready.some((item) => item.upload.id === r.upload.id) &&
                        !excluded.includes(r.upload.id))
                    }
                    checked={ready.some((item) => item.upload.id === r.upload.id)}
                    onChange={(e) =>
                      setExcluded((old) =>
                        e.target.checked
                          ? old.filter((id) => id !== r.upload.id)
                          : [...old, r.upload.id],
                      )
                    }
                  />
                </td>
                <td>
                  {r.draft?.house} · {r.draft?.kind}
                  <strong>{r.draft?.selections[0]?.event ?? 'Sin reconocer'}</strong>
                  <small>
                    {r.draft?.selections.length ?? 0} selecciones · Cuota{' '}
                    {r.historical?.header.odds ?? r.draft?.odds ?? 'no visible'}
                    {r.historical?.header.oddsSource === 'selection-product' ? ' calculada' : ''}
                  </small>
                  {r.draft?.potential !== undefined && (
                    <small>Potencial, no cobrado: {money(r.draft.potential)}</small>
                  )}
                  <details>
                    <summary>Selecciones y evidencia</summary>
                    {r.draft?.selections.map((s, i) => (
                      <p key={i}>
                        {s.event} · {s.market} · {s.pick} · {s.odds ?? 'cuota ausente'}
                        {s.builderMarkets?.map((m) => ` · ${m.market}: ${m.pick}`).join('')}
                      </p>
                    ))}
                    <pre className="ocr-text">{r.draft?.text}</pre>
                  </details>
                  {!!r.reasons.length && <small role="note">Excluida: {r.reasons.join(' ')}</small>}
                  {r.duplicateOf && <small>Posible duplicado · sin nuevo cargo ni retorno.</small>}
                </td>
                <td data-label="Estado">{r.evidence?.kind ?? 'Pendiente'}</td>
                <td data-label="Stake">
                  {r.draft?.stake === undefined ? 'Sin leer' : money(r.draft.stake)}
                </td>
                <td data-label="Cobrado">
                  {r.historical ? money(r.historical.returned) : 'Sin acreditar'}
                </td>
                <td data-label="Neto">
                  {r.historical ? money(r.historical.returned - r.historical.closedStake) : '—'}
                </td>
                <td data-label="Partido">
                  {r.historical?.timing?.events.length
                    ? r.historical.timing.events.map((e, i) => (
                        <small key={i}>
                          {e.label} · {e.at ? displayDate(e.at) : 'fecha desconocida'}
                          {e.relative ? ' (referencia de carga)' : ''}
                        </small>
                      ))
                    : 'Fecha no visible'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <strong>
          {ready.length} boletos · Stake {money(stake)} · Cobrado {money(returned)} · Neto{' '}
          {money(returned - stake)}
        </strong>
      </p>
      <p>{financial.length} nuevas · {ready.length - financial.length} posibles duplicadas sin cargo.</p>
      <p>
        Al confirmar autorizas registrar este resumen completo: un cargo y un retorno por boleto.
        Las excepciones y ofertas no se registran.
      </p>
      <div className="form-footer">
        <Button disabled={busy || !ready.length} onClick={() => void confirm()}>
          {busy ? 'Guardando lote…' : `Confirmar y registrar ${ready.length} liquidadas`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setRecordedAt(timestamp())}>
          Actualizar resumen
        </Button>
      </div>
      {rows.length > 25 && (
        <p>Se procesan hasta 25 por operación. Las restantes seguirán disponibles.</p>
      )}
      {result && <p role="status">{result}</p>}
    </section>
  );
}
