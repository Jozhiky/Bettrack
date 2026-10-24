import { useState } from 'react';
import { money, toCents, fromLocal } from '../domain/model';
import type { ReviewDraft } from '../ocr/review';
import { settlementEvidence, validateHistoricalImport } from '../ocr/settlement';
import { Field } from './ui';
const local = (iso?: string) =>
  iso ? new Date(Date.parse(iso) - 5 * 3600000).toISOString().slice(0, 16) : '';
const decimal = (cents?: number) => (cents === undefined ? '' : (cents / 100).toFixed(2));
export function useHistoricalImport(draft?: ReviewDraft) {
  const evidence = settlementEvidence(draft ?? { text: '' });
  const [kind, setKind] = useState<string>(evidence.kind ?? '');
  const [betDate, setBetDate] = useState(local(evidence.betDate));
  const [settlementDate, setSettlementDate] = useState(local(evidence.settlementDate));
  const [returned, setReturned] = useState(decimal(evidence.returned));
  const [header, setHeader] = useState({
    house: draft?.house ?? '',
    kind: draft?.kind ?? '',
    stake: decimal(draft?.stake),
    odds: draft?.odds?.toString() ?? '',
    potential: decimal(draft?.potential),
  });
  let data,
    error = '';
  if (evidence.candidate)
    try {
      if (!betDate || !settlementDate || !returned || Object.values(header).some((v) => !v.trim()))
        throw Error(
          'Completa fechas históricas, datos del boleto e importe realmente recibido. No se usa la fecha de subida.',
        );
      data = validateHistoricalImport(
        {
          kind,
          betDate:
            evidence.betDate && local(evidence.betDate) === betDate
              ? evidence.betDate
              : fromLocal(betDate),
          settlementDate:
            evidence.settlementDate && local(evidence.settlementDate) === settlementDate
              ? evidence.settlementDate
              : fromLocal(settlementDate),
          returned: toCents(returned),
          closedStake: toCents(header.stake),
          fullClosureConfirmed: true,
          header: {
            ...header,
            stake: toCents(header.stake),
            odds: Number(header.odds.replace(',', '.')),
            potential: toCents(header.potential),
          },
        },
        draft!,
      );
    } catch (e) {
      error =
        e instanceof Error && !('issues' in e)
          ? e.message
          : 'Revisa los importes y campos obligatorios; deben ser valores válidos, sin redondeos.';
    }
  return {
    evidence,
    candidate: evidence.candidate,
    kind,
    setKind,
    betDate,
    setBetDate,
    settlementDate,
    setSettlementDate,
    returned,
    setReturned,
    header,
    setHeader,
    data,
    error,
  };
}
export function HistoricalImportFields({
  form,
  preview,
}: {
  form: ReturnType<typeof useHistoricalImport>;
  preview: boolean;
}) {
  if (!form.candidate) return null;
  const d = form.data;
  if (preview && d)
    return (
      <section className="notice" aria-label="Resumen de importación histórica">
        <strong>Liquidación definitiva: {d.kind}</strong>
        <dl className="capture-review-summary">
          <div>
            <dt>Fecha de apuesta</dt>
            <dd>{new Date(d.betDate).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</dd>
          </div>
          <div>
            <dt>Fecha de liquidación</dt>
            <dd>
              {new Date(d.settlementDate).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
            </dd>
          </div>
          <div>
            <dt>Stake cerrado completo</dt>
            <dd>{money(d.closedStake)}</dd>
          </div>
          <div>
            <dt>Retorno realizado</dt>
            <dd>{money(d.returned)}</dd>
          </div>
          <div>
            <dt>Resultado neto</dt>
            <dd>{money(d.returned - d.closedStake)}</dd>
          </div>
        </dl>
        <p>
          Una sola operación: un cargo de stake y un retorno, con liquidación {d.kind}. El potencial
          y la oferta cashout no se contabilizan como cobro.
        </p>
      </section>
    );
  return (
    <section className="capture-review-leg" aria-label="Datos de importación histórica">
      <h3>Importar boleto liquidado</h3>
      <p>
        Transcribe solo datos comprobados. Las fechas usan Lima (UTC−05:00); la fecha de subida se
        conserva aparte. El cierre debe ser total.
      </p>
      {form.evidence.manualState && (
        <p className="capture-reason">
          La etiqueta puede pertenecer a una selección. Elige el estado solo si has comprobado que
          corresponde al boleto completo.
        </p>
      )}
      {form.evidence.partial && (
        <p role="alert">
          Cashout parcial o stake cerrado ambiguo. Permanece en revisión; este flujo admite
          únicamente cierres totales.
        </p>
      )}
      <Field label="Estado final">
        <select
          value={form.kind}
          onChange={(e) => {
            form.setKind(e.target.value);
            if (e.target.value === 'Perdida') form.setReturned('0.00');
          }}
        >
          <option value="">Selecciona el estado acreditado</option>
          {form.evidence.kinds.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </Field>
      <Field label="Casa del boleto">
        <select
          value={form.header.house}
          onChange={(e) => form.setHeader({ ...form.header, house: e.target.value })}
        >
          <option value="">Sin reconocer</option>
          <option>Betano</option>
          <option>Bet365</option>
        </select>
      </Field>
      <Field label="Tipo del boleto">
        <select
          value={form.header.kind}
          onChange={(e) => form.setHeader({ ...form.header, kind: e.target.value })}
        >
          <option value="">Sin reconocer</option>
          <option>Simple</option>
          <option>Combinada</option>
        </select>
      </Field>
      {(['stake', 'odds', 'potential'] as const).map((key, i) => (
        <Field
          key={key}
          label={['Stake histórico', 'Cuota total histórica', 'Retorno potencial original'][i]}
        >
          <input
            inputMode="decimal"
            value={form.header[key]}
            onChange={(e) => form.setHeader({ ...form.header, [key]: e.target.value })}
          />
        </Field>
      ))}
      <Field label="Fecha de apuesta">
        <input
          type="datetime-local"
          value={form.betDate}
          onChange={(e) => form.setBetDate(e.target.value)}
        />
      </Field>
      <Field label="Fecha de liquidación">
        <input
          type="datetime-local"
          value={form.settlementDate}
          onChange={(e) => form.setSettlementDate(e.target.value)}
        />
      </Field>
      <Field
        label="Importe efectivamente recibido"
        hint="Importe cobrado, no beneficio ni retorno potencial. Si falta en la imagen debes cotejarlo antes de confirmarlo."
      >
        <input
          inputMode="decimal"
          value={form.returned}
          readOnly={form.kind === 'Perdida'}
          onChange={(e) => form.setReturned(e.target.value)}
        />
      </Field>
    </section>
  );
}
