import { useLiveQuery } from '../data/useCloudQuery';
import { retryFailedCaptures } from '../data/captures';
import { repo } from '../data/repository';
import { useCaptureInput } from '../app/useCaptureInput';
import { workspaceItems } from '../domain/workspace';
import { CapturePending } from '../components/CapturePending';
import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Camera,
  Upload,
  Ticket,
  LayoutGrid,
  Rows3,
  SlidersHorizontal,
} from 'lucide-react';
import { useApp } from '../app/context';
import { Button } from '../components/ui';
import { BetDetail } from '../components/BetDetail';
import { BetTable } from '../components/BetTable';
import { Filters, filterBets, initialFilter, type Filter } from '../components/Filters';
import { useHistoryView } from '../app/historyView';
import { Pagination } from '../components/Pagination';
import { BetCard } from '../components/BetCard';
import { ticketReference } from '../components/TicketSummary';
import { position } from '../domain/model';
import { BetOverview } from '../components/BetOverview';
import { HistoricalCaptureInbox } from '../components/HistoricalCaptureInbox';
export function Bets() {
  const { data, settings, run } = useApp();
  const { value, update } = useHistoryView();
  const { filter, search, sort, page, size, view, tab } = value;
  const setFilter = (v: Filter) => update('filter', v),
    setSearch = (v: string) => update('search', v),
    setSort = (v: string) => update('sort', v as typeof sort),
    setPage = (v: number) => update('page', v),
    setSize = (v: number) => update('size', v as typeof size),
    setView = (v: typeof view) => update('view', v),
    setTab = (v: string) => update('tab', v as typeof tab);
  const [selected, setSelected] = useState<string>();
  const filterMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (e: PointerEvent | KeyboardEvent) => {
      if (!filterMenu.current?.open) return;
      if (
        e instanceof KeyboardEvent
          ? e.key === 'Escape'
          : !filterMenu.current.contains(e.target as Node)
      ) {
        filterMenu.current.open = false;
        if (e instanceof KeyboardEvent) filterMenu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);
  const uploads = useLiveQuery(
    () =>
      repo.database.uploads
        .where('status')
        .anyOf('queued', 'processing', 'review', 'error', 'duplicate')
        .toArray(),
    [],
    [],
  );
  const revealUploads = () => {
    setTab('open');
    setFilter(initialFilter);
    setSearch('');
    setSort('new');
    setPage(1);
    document.querySelector('.workspace-scroll')?.scrollTo(0, 0);
  };
  const {
    fileInput,
    cameraInput,
    add,
    adding,
    dragging,
    uploadLabel,
    failedFiles,
    retryUploads,
    dismissFailures,
  } = useCaptureInput(revealUploads);
  const unresolved = uploads.filter((u) => !data.bets.some((b) => b.id === u.id));
  const showCaptures = () => {
    revealUploads();
    const pending = filterBets(data, initialFilter, settings.currency).filter(
      (b) => position(b, data.settlements).status === 'Pendiente',
    );
    const index = workspaceItems(pending, uploads, data.bets, true, 'new').findIndex(
      (i) => i.type === 'capture',
    );
    setPage(Math.floor(Math.max(0, index) / size) + 1);
  };
  const failed = unresolved.filter((u) => ['error', 'review'].includes(u.status)).length;
  const reading = unresolved.filter((u) => ['queued', 'processing'].includes(u.status)).length;
  const scoped = filterBets(data, filter, settings.currency);
  const open = scoped.filter((b) => position(b, data.settlements).status === 'Pendiente');
  const filtered = scoped
    .filter(
      (b) =>
        tab === 'all' ||
        (tab === 'open'
          ? position(b, data.settlements).status === 'Pendiente'
          : position(b, data.settlements).status !== 'Pendiente'),
    )
    .filter((b) =>
      [
        b.notes,
        b.id,
        ticketReference(b),
        ...data.selections
          .filter((s) => s.betId === b.id)
          .flatMap((s) => [
            s.event,
            s.pick,
            s.market,
            ...(s.builderMarkets ?? []).flatMap((m) => [m.market, m.pick]),
          ]),
      ]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'stake'
        ? b.stake - a.stake
        : sort === 'old'
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
    );
  const items = workspaceItems(filtered, uploads, data.bets, tab !== 'closed', sort);
  const pages = Math.max(1, Math.ceil(items.length / size)),
    current = Math.min(page, pages);
  useEffect(() => {
    if (page !== current) update('page', current);
  }, [page, current, update]);
  return (
    <div className="bet-workspace">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        aria-label="Archivos de capturas"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Capturar boleto"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {dragging && (
        <div className="capture-drop-overlay">
          <Upload size={40} />
          <strong>Suelta tus capturas aquí</strong>
          <span>
            {settings.automaticCaptures
              ? 'Registraremos las lecturas acreditadas y conservaremos las excepciones.'
              : 'Leeremos cada boleto para que lo revises antes de registrarlo.'}
          </span>
        </div>
      )}
      <div className="page-heading workspace-heading">
        <div>
          <span className="workspace-eyebrow">CAPTURA. REGISTRA. CONTROLA.</span>
          <h1>Mis apuestas</h1>
          <p>Sube o pega una captura. Tu registro empieza aquí.</p>
        </div>
        <div className="workspace-upload-actions">
          <Button onClick={() => fileInput.current?.click()} disabled={adding}>
            <Plus size={18} />
            {adding ? uploadLabel || 'Preparando…' : 'Subir capturas'}
          </Button>
          <Button
            variant="secondary"
            aria-label="Usar cámara"
            title="Usar cámara"
            disabled={adding}
            onClick={() => cameraInput.current?.click()}
          >
            <Camera size={18} />
          </Button>
        </div>
      </div>
      {settings.automaticCaptures && (
        <p className="notice" role="status">
          Registro automático activo. Las capturas nuevas con datos acreditados se guardan sin
          confirmar lotes. Las ambiguas se conservan sin movimientos.
        </p>
      )}
      <BetOverview bets={scoped} settlements={data.settlements} currency={settings.currency} />
      <HistoricalCaptureInbox uploads={unresolved} />
      <div className="workspace-context">
        {unresolved.length > 0 && (
          <button className="processing-link" onClick={showCaptures}>
            {reading > 0 ? `${reading} en lectura` : ''}
            {reading > 0 && unresolved.length > reading ? ' · ' : ''}
            {unresolved.length > reading ? `${unresolved.length - reading} por resolver` : ''}
            {tab === 'closed' ? ' · Ver capturas' : ''}
          </button>
        )}
        {failed > 1 && (
          <Button
            variant="ghost"
            onClick={() => void run(() => retryFailedCaptures(), 'Lecturas en cola')}
          >
            Reintentar {failed} lecturas
          </Button>
        )}
      </div>
      {failedFiles.length > 0 && (
        <section className="notice" aria-label="Capturas sin subir">
          <strong>{failedFiles.length} capturas no se pudieron subir</strong>
          <details>
            <summary>Ver archivos y motivos</summary>
            <ul>
              {failedFiles.map((item, index) => (
                <li key={index}>
                  {item.file.name}: {item.error}
                </li>
              ))}
            </ul>
          </details>
          <div className="quick-results">
            <Button variant="secondary" disabled={adding} onClick={() => void retryUploads()}>
              Reintentar subidas fallidas
            </Button>
            <Button variant="ghost" disabled={adding} onClick={dismissFailures}>
              Descartar fallidas
            </Button>
          </div>
        </section>
      )}
      <div className="view-toolbar">
        <div className="segmented" aria-label="Bandejas de apuestas">
          {[
            ['open', 'Pendientes', open.length],
            ['closed', 'Terminadas', scoped.length - open.length],
            ['all', 'Todas', scoped.length],
          ].map(([key, label, count]) => (
            <Button
              key={key}
              variant={tab === key ? 'primary' : 'ghost'}
              aria-pressed={tab === key}
              onClick={() => {
                setTab(String(key));
                setPage(1);
              }}
            >
              {label} <span className="tab-count">{count}</span>
            </Button>
          ))}
        </div>
        <div className="segmented">
          <Button
            variant={view === 'cards' ? 'primary' : 'ghost'}
            aria-pressed={view === 'cards'}
            onClick={() => setView('cards')}
          >
            <LayoutGrid size={15} /> Tarjetas
          </Button>
          <Button
            variant={view === 'table' ? 'primary' : 'ghost'}
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            <Rows3 size={15} /> Tabla
          </Button>
        </div>
      </div>
      <section className="workspace-list" aria-label="Boletos y capturas">
        <div className="table-toolbar">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar apuestas"
              placeholder="Buscar partido, mercado o referencia…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <details ref={filterMenu} className="workspace-filter-menu">
            <summary>
              <SlidersHorizontal size={14} /> Filtros
              {Object.entries(filter).some(([k, v]) => v !== initialFilter[k as keyof Filter])
                ? ' · activos'
                : ''}
            </summary>
            <Filters
              compact
              value={filter}
              onChange={(f) => {
                if (f.state !== filter.state) setTab('all');
                setFilter(f);
                setPage(1);
                if (
                  window.matchMedia('(max-width: 700px)').matches &&
                  f.period !== 'Personalizado' &&
                  filterMenu.current
                )
                  filterMenu.current.open = false;
              }}
            />
          </details>
          <select
            aria-label="Ordenar apuestas"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="new">Más recientes</option>
            <option value="old">Más antiguas</option>
            <option value="stake">Mayor stake</option>
          </select>
        </div>
        {view === 'table' ? (
          <BetTable
            bets={[]}
            items={items.slice((current - 1) * size, current * size)}
            onSelect={setSelected}
          />
        ) : (
          <div className="bet-grid">
            {items.slice((current - 1) * size, current * size).map((item) => (
              <div
                className="workspace-item"
                key={item.id}
                data-kind={item.type}
                data-item-id={item.id}
              >
                {item.type === 'bet' ? (
                  <BetCard bet={item.bet} onSelect={setSelected} />
                ) : (
                  <CapturePending upload={item.upload} onSelect={setSelected} />
                )}
              </div>
            ))}
            {!items.length && (
              <div className="empty workspace-empty">
                <Ticket size={40} strokeWidth={1} />
                <h3>
                  {!data.bets.length
                    ? 'Una captura. Tu apuesta registrada.'
                    : tab === 'open'
                      ? 'Todo al día'
                      : 'Sin apuestas en esta vista'}
                </h3>
                <p>
                  {!data.bets.length
                    ? 'Arrastra tus boletos aquí, pégalos con Ctrl + V o usa Subir capturas. La lectura se realiza en tu dispositivo.'
                    : tab === 'open'
                      ? 'No hay apuestas abiertas con estos filtros.'
                      : 'Cambia la bandeja o los filtros para ver más apuestas.'}
                </p>
              </div>
            )}
          </div>
        )}
        <Pagination
          total={items.length}
          page={current}
          size={size}
          onPage={setPage}
          onSize={(n) => {
            setSize(n);
            setPage(1);
          }}
          label="boletos"
        />
      </section>

      {selected && <BetDetail betId={selected} onClose={() => setSelected(undefined)} />}
    </div>
  );
}
