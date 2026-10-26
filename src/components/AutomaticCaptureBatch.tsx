import { useEffect, useMemo, useRef, useState } from 'react';
import { hasLiveMatchEvidence } from '../ocr/visualMode';
import { useApp } from '../app/context';
import { money, displayDate, timestamp, emptySnapshot, type CaptureUpload } from '../domain/model';
import { previewAutomaticBatch } from '../ocr/automaticImport';
import { confirmAutomaticBatch, type AutomaticBatchItem } from '../data/captures';
import { Button } from './ui';
import { readDraft } from '../ocr/review';
import { enrichCaptureModes } from '../data/captureVisualMode';
import { enrichCaptureReceipts } from '../data/captureReceipt';
import { needsReceiptRead } from '../ocr/settlement';

export function AutomaticCaptureBatch({ uploads }: { uploads: CaptureUpload[] }) {
  const { run, data, settings } = useApp();
  const [recordedAt, setRecordedAt] = useState(timestamp);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const lock = useRef(false);
  const scanned = useRef(new Set<string>());
  const [scanning, setScanning] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const scanActive = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const candidates = uploads.filter(
    (u) =>
      ['review', 'error'].includes(u.status) &&
      readDraft(u.draftJson)?.house === 'Betano' &&
      (!readDraft(u.draftJson)?.visualMode || needsReceiptRead(readDraft(u.draftJson)!)),
  );
  const scanKey = candidates.map((u) => u.id + ':' + u.imageId).join('|');
  const pending = candidates.filter((u) => !scanned.current.has(u.id + ':' + u.imageId));
  useEffect(() => {
    if (scanActive.current || !pending.length) return;
    scanActive.current = true;
    for (const u of pending) scanned.current.add(u.id + ':' + u.imageId);
    setScanning(true);
    void enrichCaptureModes(pending.map((u) => u.id))
      .then(async (modes) => {
        const receipts = await enrichCaptureReceipts(pending.map((u) => u.id));
        return { failed: modes.failed + receipts.failed };
      })
      .then((r) => {
        if (mounted.current) setScanFailed(r.failed > 0);
      })
      .catch(() => {
        if (mounted.current) setScanFailed(true);
      })
      .finally(() => {
        scanActive.current = false;
        if (mounted.current) setScanning(false);
      });
  }, [scanKey, scanning, recordedAt]);
  const { rows, ready } = useMemo(
    () => previewAutomaticBatch(uploads, recordedAt, data ?? emptySnapshot, excluded),
    [uploads, recordedAt, data, excluded],
  );
  if (!rows.some((r) => r.evidence?.candidate)) return null;
  if (settings?.automaticCaptures)
    return (
      <section className="panel" aria-label="Registro automático activo">
        <h2>Registro automático activo</h2>
        <p>
          Las nuevas capturas con datos acreditados se registran al terminar la lectura. Las
          excepciones se conservan sin cargos; este modo no pide confirmar lotes.
        </p>
      </section>
    );
  const financial = ready.filter((r) => r.expectedOutcome === 'saved');
  const stake = financial.reduce((n, r) => n + r.historical!.closedStake, 0);
  const returned = financial.reduce((n, r) => n + r.historical!.returned, 0);
  const confirm = async () => {
    if (lock.current || scanning || pending.length || !ready.length) return;
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
                  {r.draft && hasLiveMatchEvidence(r.draft) && (
                    <small>⚡ Partido en vivo en la captura</small>
                  )}
                  {r.historical?.timing?.mode === 'live' && <small>Apuesta colocada en vivo</small>}
                  {r.historical?.timing?.mode === 'prematch' && (
                    <small>Apuesta colocada antes del partido</small>
                  )}
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
                          {e.relative && e.at ? ' (estimación anterior desde la carga)' : ''}
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
      {scanning && <p role="status">Comprobando iconos y cobros de las capturas guardadas…</p>}
      {scanFailed && (
        <p>
          Algún icono o cobro no se pudo comprobar. El boleto conserva su revisión; puedes
          actualizar el resumen para reintentar.
        </p>
      )}
      <p>
        {financial.length} nuevas · {ready.length - financial.length} posibles duplicadas sin cargo.
      </p>
      <p>
        Al confirmar autorizas registrar este resumen completo: un cargo y un retorno por boleto.
        Las excepciones y ofertas no se registran.
      </p>
      <div className="form-footer">
        <Button
          disabled={busy || scanning || !!pending.length || !ready.length}
          onClick={() => void confirm()}
        >
          {busy ? 'Guardando lote…' : `Confirmar y registrar ${ready.length} liquidadas`}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || scanning}
          onClick={() => {
            scanned.current.clear();
            setRecordedAt(timestamp());
          }}
        >
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
