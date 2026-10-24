import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/context';
import { repo } from '../data/repository';
import { id, timestamp, position, toCents, type Bet } from '../domain/model';
import { Button, Modal, Field } from './ui';
import { Check, X, Banknote } from 'lucide-react';

function ResultPrompt({ inline, title, description, children, onClose, onOpenAutoFocus, onCloseAutoFocus }: {
  inline: boolean; title: string; description: string; children: ReactNode;
  onClose: () => void; onOpenAutoFocus: (event: Event) => void; onCloseAutoFocus: (event: Event) => void;
}) {
  return inline ? <section className="inline-result" aria-label={title}>
    <div className="section-heading"><h4>{title}</h4><Button variant="ghost" onClick={onClose}>Cancelar</Button></div>
    <p className="muted">{description}</p>{children}
  </section> : <Modal title={title} description={description} onClose={onClose} onOpenAutoFocus={onOpenAutoFocus} onCloseAutoFocus={onCloseAutoFocus}>{children}</Modal>;
}
export function QuickResult({ bet, onDetail, inline = false }: { bet: Bet; onDetail: () => void; inline?: boolean }) {
  const { data, run } = useApp();
  const p = position(bet, data.settlements);
  const [dialog, setDialog] = useState<'Ganada' | 'Cashout'>(),
    [amount, setAmount] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const controls = useRef<HTMLDivElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (inline && dialog) amountInput.current?.focus(); }, [inline, dialog]);
  const open = (kind: 'Ganada' | 'Cashout') => {
    setAmount('');
    setError('');
    setDialog(kind);
  };
  async function finish(kind: 'Ganada' | 'Perdida' | 'Cashout', returned: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const settlementId = id();
      const ok = await run(
        () =>
          repo.settle({
            id: settlementId,
            betId: bet.id,
            date: timestamp(),
            closedStake: bet.stake,
            returned,
            kind,
            note: 'Resultado indicado desde el historial',
          }),
        'Resultado actualizado',
        () => repo.undoSettlement(settlementId),
      );
      if (ok) {
        setDialog(undefined);
        setAmount('');
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (p.status !== 'Pendiente' || p.needsReview)
    return (
      <div ref={controls}>
        <Button variant="ghost" onClick={onDetail}>
          {p.needsReview ? 'Revisar registro anterior' : 'Ver resultado'}
        </Button>
      </div>
    );
  return (
    <div ref={controls}>
      <div className="quick-results">
        <Button
          className="result-win"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            bet.potential === null || bet.bonus?.treatment === 'Sin confirmar'
              ? open('Ganada')
              : void finish(
                  'Ganada',
                  bet.potential + (bet.bonus?.treatment === 'Adicional' ? bet.bonus.amount : 0),
                )
          }
        >
          <Check size={14} /> Ganada
        </Button>
        <Button className="result-loss" variant="secondary" disabled={busy} onClick={() => void finish('Perdida', 0)}>
          <X size={14} /> Perdida
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => open('Cashout')}>
          <Banknote size={14} /> Cashout
        </Button>
      </div>
      {dialog && (
        <ResultPrompt inline={inline}
          onOpenAutoFocus={event => { event.preventDefault(); amountInput.current?.focus(); }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            controls.current?.querySelector('button')?.focus();
          }}
          title={dialog === 'Cashout' ? 'Registrar cashout' : 'Confirmar retorno cobrado'}
          description={
            dialog === 'Cashout'
              ? 'Ingresa el total que recibiste al cerrar esta apuesta.'
              : 'El boleto tiene un bono sin confirmar. Ingresa el total realmente cobrado.'
          }
          onClose={() => {
            if (!busy) setDialog(undefined);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const cents = toCents(amount);
                if (cents < 0) throw new Error('El monto no puede ser negativo');
                void finish(dialog, cents);
              } catch (error) {
                setError(error instanceof Error ? error.message : String(error));
              }
            }}
          >
            <Field label="Monto cobrado">
              <input
                ref={amountInput}
                autoFocus
                required
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                aria-invalid={!!error}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
              />
            </Field>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar resultado'}
            </Button>
          </form>
        </ResultPrompt>
      )}
    </div>
  );
}
