import { transact } from '../data/cloudStore';
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useApp } from '../app/context';
import { repo, LocalRepository } from '../data/repository';
import { hashImage } from '../ocr/engine';
import {
  id,
  timestamp,
  kinds,
  toCents,
  decimal,
  localInput,
  fromLocal,
  fingerprint,
  money,
  promotions,
  bonusTreatments,
  type Bet,
  type Selection,
  type StoredImage,
  type Settlement,
} from '../domain/model';
import { Button, Field } from './ui';
const formSchema = z.object({
  date: z.string().min(1),
  houseId: z.string().min(1),
  streamerId: z.string(),
  kind: z.enum(kinds),
  live: z.boolean(),
  stake: z.string().min(1),
  odds: z.string().min(1),
  potential: z.string(),
  bonusAmount: z.string(),
  bonusTreatment: z.enum(bonusTreatments),
  notes: z.string(),
  selections: z
    .array(
      z.object({
        event: z.string().trim().min(1, 'Completa el evento'),
        market: z.string().trim().min(1, 'Completa el mercado'),
        pick: z.string().trim().min(1, 'Completa la selección'),
        sport: z.string(),
        league: z.string(),
        odds: z.string(),
        promotion: z.enum(promotions),
        builderMarkets: z.array(
          z.object({
            market: z.string().trim().min(1),
            pick: z.string().trim().min(1),
            promotion: z.enum(promotions).optional(),
          }),
        ),
      }),
    )
    .min(1),
});
type Values = z.infer<typeof formSchema>;
export interface BetFormProps {
  initial?: Partial<Bet>;
  selections?: Partial<Selection>[];
  image?: StoredImage;
  settlements?: Partial<Settlement>[];
  onDone: () => void;
  warnings?: string[];
  needsDate?: boolean;
}
export function BetForm({
  initial,
  selections,
  image,
  settlements = [],
  onDone,
  warnings = [],
  needsDate = false,
}: BetFormProps) {
  const { data, run, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [includeSettlements, setIncludeSettlements] = useState(true);
  const form = useForm<Values>({
    resolver: zodResolver(
      initial?.historical ? formSchema.extend({ odds: z.string() }) : formSchema,
    ),
    defaultValues: {
      date: needsDate ? '' : localInput(initial?.date || timestamp()),
      houseId:
        initial?.houseId ||
        (initial?.source === 'ocr' ? '' : data.houses.find((h) => h.active)?.id) ||
        '',
      streamerId: initial?.streamerId || '',
      kind: initial?.kind || 'Simple',
      live: initial?.live || false,
      stake: initial?.stake !== undefined ? String(initial.stake / 100) : '',
      odds: initial?.odds != null ? String(initial.odds) : '',
      potential: initial?.potential != null ? String(initial.potential / 100) : '',
      bonusAmount: initial?.bonus ? String(initial.bonus.amount / 100) : '',
      bonusTreatment: initial?.bonus?.treatment || 'Sin confirmar',
      notes: initial?.notes || '',
      selections: (selections?.length ? selections : [{}]).map((s) => ({
        event: s.event || '',
        market: s.market || '',
        pick: s.pick || '',
        sport: s.sport || '',
        league: s.league || '',
        odds: s.odds ? String(s.odds) : '',
        promotion: s.promotion || '',
        builderMarkets: s.builderMarkets || [],
      })),
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'selections' });
  const watch = form.watch();
  const house = data.houses.find((h) => h.id === watch.houseId);
  let estimate = '—';
  try {
    estimate = ((toCents(watch.stake) * decimal(watch.odds)) / 100).toFixed(2);
  } catch {
    /* empty */
  }
  const submit = form.handleSubmit(async (v) => {
    setBusy(true);
    try {
      const betId = initial?.id || id();
      const now = timestamp();
      const bet: Bet = {
        id: betId,
        date:
          initial?.date && v.date === localInput(initial.date) ? initial.date : fromLocal(v.date),
        dateSource:
          initial?.date && v.date === localInput(initial.date) ? initial.dateSource : 'manual',
        timingUnknown: initial?.timingUnknown && v.live === initial.live,
        houseId: v.houseId,
        streamerId: v.streamerId,
        kind: v.kind,
        live: v.live,
        stake: toCents(v.stake),
        ...(initial?.historical ? { historical: true } : {}),
        odds: initial?.historical && !v.odds.trim() ? null : decimal(v.odds),
        potential:
          initial?.historical && !v.potential.trim()
            ? null
            : v.potential
              ? toCents(v.potential)
              : Math.round(toCents(v.stake) * decimal(v.odds)),
        notes: v.notes,
        bonus: v.bonusAmount
          ? { amount: toCents(v.bonusAmount), treatment: v.bonusTreatment }
          : undefined,
        source: initial?.source || 'manual',
        imageId: image?.id || initial?.imageId,
        fingerprint: '',
        createdAt: initial?.createdAt || now,
        updatedAt: now,
      };
      const rows = v.selections.map((s) => ({
        ...s,
        id: id(),
        betId,
        odds: s.odds ? decimal(s.odds) : null,
      }));
      bet.fingerprint = fingerprint(bet, rows);
      const storedImage = image
        ? { ...image, hash: image.hash || (await hashImage(image.blob)) }
        : undefined;
      const duplicate = data.bets.some((b) => b.id !== betId && b.fingerprint === bet.fingerprint);
      const imageDuplicate =
        storedImage && (await repo.database.images.where('hash').equals(storedImage.hash).count());
      if (
        (duplicate || imageDuplicate) &&
        !window.confirm(
          `${imageDuplicate ? 'Esta imagen ya existe.' : 'Hay una apuesta similar en el historial.'} Pueden ser operaciones distintas. ¿Guardar igualmente?`,
        )
      )
        return;
      const success = await run(() =>
        transact(repo.database, 'rw', repo.database.tables, async (database) => {
          const scoped = new LocalRepository(database);
          await scoped.saveBet(bet, rows, storedImage);
          for (const s of includeSettlements ? settlements : []) {
            await scoped.settle({
              id: id(),
              betId,
              date: s.date || bet.date,
              closedStake: s.closedStake!,
              returned: s.returned!,
              kind: s.kind!,
              note: s.note || 'Importación confirmada',
            });
          }
        }),
      );
      if (success) onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  });
  return (
    <form onSubmit={submit} className="bet-form">
      {warnings.length > 0 && (
        <div className="notice warning">
          <strong>Revisión recomendada</strong>
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      <div className="form-grid">
        <Field label="Casa de apuestas">
          <select {...form.register('houseId')}>
            <option value="">Selecciona la casa</option>
            {data.houses
              .filter((h) => h.active || h.id === initial?.houseId)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} · {h.currency}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Fecha y hora · Lima">
          <input type="datetime-local" {...form.register('date')} required />
        </Field>
        <Field label="Tipo de apuesta">
          <select {...form.register('kind')}>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Atribución opcional">
          <select {...form.register('streamerId')}>
            <option value="">Sin atribución / Pronóstico propio</option>
            {data.streamers
              .filter((s) => s.active || s.id === initial?.streamerId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" {...form.register('live')} /> Apuesta en vivo
      </label>
      <div className="section-heading">
        <h3>
          Selecciones <span className="count">{fields.length}</span>
        </h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            append({
              event: '',
              market: '',
              pick: '',
              sport: '',
              league: '',
              odds: '',
              promotion: '',
              builderMarkets: [],
            })
          }
        >
          <Plus size={15} /> Añadir selección
        </Button>
      </div>
      {fields.map((f, index) => (
        <div
          className={`selection-form ${warnings.some((w) => w.startsWith(`Selección ${index + 1}:`)) ? 'review-needed' : ''}`}
          key={f.id}
        >
          <div className="selection-title">
            <strong>Selección {String(index + 1).padStart(2, '0')}</strong>
            {warnings.some((w) => w.startsWith(`Selección ${index + 1}:`)) && (
              <span className="review-tag">Revisa el texto</span>
            )}
            {fields.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                aria-label={`Eliminar selección ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 size={15} />
              </Button>
            )}
          </div>
          <div className="form-grid">
            <Field label="Evento / equipos">
              <input
                placeholder="Equipo local vs. visitante"
                {...form.register(`selections.${index}.event`)}
                required
              />
            </Field>
            <Field label="Mercado exacto" hint="Incluye equipo, periodo y línea si corresponde.">
              <input
                placeholder="Goles del partido · tiempo completo"
                {...form.register(`selections.${index}.market`)}
                required
              />
            </Field>
            <Field label="Selección">
              <input
                placeholder="Más de 2.5"
                {...form.register(`selections.${index}.pick`)}
                required
              />
            </Field>
            <Field label="Cuota individual (opcional)">
              <input
                inputMode="decimal"
                placeholder="1.85"
                {...form.register(`selections.${index}.odds`)}
              />
            </Field>
            <Field label="Deporte">
              <input placeholder="Fútbol" {...form.register(`selections.${index}.sport`)} />
            </Field>
            <Field label="Liga / competición">
              <input {...form.register(`selections.${index}.league`)} />
            </Field>
            <Field
              label="Promoción de la selección"
              hint="Confirma el icono. La promoción no prueba un cobro."
            >
              <select {...form.register(`selections.${index}.promotion`)}>
                {promotions.map((p) => (
                  <option key={p} value={p}>
                    {p || 'Sin especificar'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {(watch.selections[index]?.builderMarkets || []).map((_, child) => (
            <div className="builder-market form-grid" key={child}>
              <Field label={`Mercado interno ${child + 1}`}>
                <input
                  {...form.register(`selections.${index}.builderMarkets.${child}.market`)}
                  required
                />
              </Field>
              <Field label={`Selección interna ${child + 1}`}>
                <input
                  {...form.register(`selections.${index}.builderMarkets.${child}.pick`)}
                  required
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  form.setValue(
                    `selections.${index}.builderMarkets`,
                    watch.selections[index].builderMarkets.filter((_, i) => i !== child),
                  )
                }
              >
                Eliminar mercado {child + 1}
              </Button>
              <Field label={`Promoción interna ${child + 1}`}>
                <select {...form.register(`selections.${index}.builderMarkets.${child}.promotion`)}>
                  {promotions.map((p) => (
                    <option key={p} value={p}>
                      {p || 'Sin especificar'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              form.setValue(`selections.${index}.builderMarkets`, [
                ...watch.selections[index].builderMarkets,
                { market: '', pick: '' },
              ])
            }
          >
            <Plus size={14} /> Añadir mercado de Bet Builder
          </Button>
        </div>
      ))}
      <div className="form-grid three">
        <Field label={`Monto apostado · ${house?.currency || 'PEN'}`}>
          <input inputMode="decimal" placeholder="0.00" {...form.register('stake')} required />
        </Field>
        <Field label="Cuota total">
          <input inputMode="decimal" placeholder="2.00" {...form.register('odds')} required />
        </Field>
        <Field
          label="Retorno potencial"
          hint={
            initial?.historical
              ? 'Opcional: conserva vacío si no consta en el boleto original. No se calcula.'
              : `Calculado: ${estimate}. Conserva el mostrado si difiere.`
          }
        >
          <input
            inputMode="decimal"
            placeholder={initial?.historical ? 'No visible' : estimate}
            {...form.register('potential')}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field
          label="Bono potencial mostrado (opcional)"
          hint="Se conserva aparte. No altera tu saldo ni el retorno introducido."
        >
          <input
            inputMode="decimal"
            {...form.register('bonusAmount')}
            placeholder="Sin bono informado"
          />
        </Field>
        {watch.bonusAmount && (
          <Field label="Relación del bono con el retorno">
            <select {...form.register('bonusTreatment')}>
              {bonusTreatments.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Observaciones">
        <textarea rows={2} {...form.register('notes')} />
      </Field>
      {Object.keys(form.formState.errors).length > 0 && (
        <p className="negative" role="alert">
          Revisa los campos obligatorios y las selecciones.
        </p>
      )}
      {settlements.length > 0 && (
        <div className="notice warning">
          <strong>Liquidaciones importadas</strong>
          {settlements.map((s, i) => (
            <p key={i}>
              {s.kind} · Stake cerrado: {money(s.closedStake ?? 0, house?.currency)} · Recibido:{' '}
              {money(s.returned ?? 0, house?.currency)}
            </p>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={includeSettlements}
              onChange={(e) => setIncludeSettlements(e.target.checked)}
            />{' '}
            Confirmo estos importes y que las liquidaciones fueron ejecutadas.
          </label>
          {!includeSettlements && (
            <p>Se guardará pendiente para corregir y liquidar desde el detalle.</p>
          )}
        </div>
      )}
      <div className="form-footer">
        <span>
          <ShieldCheck size={15} /> Guardado privado en este navegador
        </span>
        <Button disabled={busy} type="submit">
          {busy ? 'Guardando…' : initial?.id ? 'Guardar cambios' : 'Confirmar y guardar'}
        </Button>
      </div>
    </form>
  );
}
