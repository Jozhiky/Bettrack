import { useEffect, useRef, useState } from 'react';
import { Image, ChevronDown } from 'lucide-react';
import { useApp } from '../app/context';
import { repo } from '../data/repository';
import { position, money, displayDate, type Bet } from '../domain/model';
import { Modal, Button } from './ui';
import { BetForm } from './BetForm';
import { CaptureHistory } from './CaptureHistory';
import { TicketSummary } from './TicketSummary';
import { QuickResult } from './QuickResult';
import { BetVisualSummary } from './BetVisualSummary';

export function BetDetail({ betId, onClose }: { betId: string; onClose: () => void }) {
  const opener = useRef(document.activeElement as HTMLElement | null);
  const { data, run } = useApp();
  const [edit, setEdit] = useState(false), [showImage, setShowImage] = useState(false),
    [image, setImage] = useState(''), [imageError, setImageError] = useState('');
  const b = data.bets.find(b => b.id === betId) as Bet;
  const p = b ? position(b, data.settlements) : null;
  useEffect(() => {
    let url = '', alive = true;
    setImage(''); setImageError('');
    if (showImage && b?.imageId) void repo.database.images.get(b.imageId).then(im => {
      if (alive && im) { url = URL.createObjectURL(im.blob); setImage(url); }
    }).catch(() => { if (alive) setImageError('No se pudo cargar la captura. Cierra y vuelve a abrir su vista.'); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [showImage, b?.imageId]);
  if (!b || !p) return null;
  const currency = data.houses.find(h => h.id === b.houseId)?.currency;
  const settlements = data.settlements.filter(s => s.betId === b.id);
  const rows = data.selections.filter(s => s.betId === b.id);
  return <Modal title={edit ? 'Editar apuesta' : 'Detalle de apuesta'}
    description={`${data.houses.find(h => h.id === b.houseId)?.name} · ${b.dateSource === 'upload' ? 'Cargada ' : ''}${displayDate(b.date)}`}
    onClose={onClose} wide detail onCloseAutoFocus={event => {
      event.preventDefault();
      if (opener.current?.isConnected) opener.current.focus({preventScroll:true});
    }}>
    {edit ? <BetForm initial={b} selections={rows} onDone={() => setEdit(false)} /> : <>
      <BetVisualSummary bet={b} rows={rows} settlements={settlements} currency={currency} />
      {p.status === 'Pendiente' && !p.needsReview && <section className="detail-result-actions" aria-label="Registrar resultado">
        <h3>¿Cómo terminó?</h3>
        <QuickResult bet={b} onDetail={() => {}} inline />
      </section>}
      {p.needsReview && <p className="notice">Revisa y corrige los cobros del registro anterior.</p>}
      {settlements.length > 0 && <section className="detail-settled">
        {settlements.map(s => <div className="list-row" key={s.id}>
          <small>{displayDate(s.date)}</small>
          <Button variant="ghost" onClick={() => {
            if (confirm('¿Revertir este resultado? Quedará auditado.')) void run(() => repo.undoSettlement(s.id));
          }}>Corregir resultado</Button>
        </div>)}
      </section>}
      <TicketSummary rows={rows} />
      {b.bonus?.treatment === 'Sin confirmar' && <p className="notice">Bono de {money(b.bonus.amount, currency)} por confirmar.</p>}
      {(b.notes || b.bonus || b.timingUnknown) && <details className="detail-disclosure">
        <summary>Notas y datos de lectura <ChevronDown size={15} /></summary>
        {b.timingUnknown && <p className="muted">No se reconoció si el boleto es en vivo o prepartido.</p>}
        {b.bonus && <p>Bono mostrado: {money(b.bonus.amount, currency)} · {b.bonus.treatment}</p>}
        {b.notes && <p className="pre-wrap">{b.notes}</p>}
      </details>}
      {b.imageId && <section className="detail-capture">
        <Button variant="secondary" aria-expanded={showImage} onClick={() => setShowImage(v => !v)}><Image size={16} />{showImage ? 'Ocultar captura' : 'Ver captura'}</Button>
        {showImage && <>
          {image ? <img className="ticket-image" src={image} alt="Captura guardada del boleto" /> : <p role="status">{imageError || 'Cargando captura…'}</p>}
          <Button variant="danger" onClick={() => { if(confirm('¿Eliminar la captura? La apuesta y su resultado se conservan.')) void run(() => repo.removeImage(b.id)); }}>Eliminar captura</Button>
        </>}
      </section>}
      <CaptureHistory betId={b.id} />
      <div className="form-footer">
        <Button variant="danger" onClick={() => { if(confirm('¿Eliminar esta apuesta y revertir sus movimientos? Quedará auditado.')) void run(() => repo.deleteBet(b.id)).then(ok => ok && onClose()); }}>Eliminar apuesta</Button>
        <Button variant="secondary" onClick={() => setEdit(true)}>Editar apuesta</Button>
      </div>
    </>}
  </Modal>;
}
