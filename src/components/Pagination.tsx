import { Button } from './ui';
export function Pagination({
  total,
  page,
  size,
  onPage,
  onSize,
  label = 'registros',
}: {
  total: number;
  page: number;
  size: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size)),
    current = Math.min(page, pages);
  const numbers = Array.from(
    { length: Math.min(5, pages) },
    (_, i) => Math.max(1, Math.min(current - 2, pages - 4)) + i,
  );
  return (
    <nav className="pagination" aria-label={`Paginación de ${label}`}>
      <span>
        {total ? `${(current - 1) * size + 1}–${Math.min(current * size, total)} de ${total}` : '0'}{' '}
        {label} · Página {current} de {pages}
      </span>
      <div className="pagination-controls">
        <select
          aria-label={`${label} por página`}
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
        >
          {[6, 12, 24, 48].map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </select>
        {pages > 1 && (
          <>
            <Button
              variant="ghost"
              disabled={current === 1}
              onClick={() => onPage(1)}
              aria-label="Primera página"
            >
              «
            </Button>
            <Button variant="ghost" disabled={current === 1} onClick={() => onPage(current - 1)}>
              Anterior
            </Button>
            {numbers.map((n) => (
              <Button
                key={n}
                variant={n === current ? 'primary' : 'ghost'}
                aria-current={n === current ? 'page' : undefined}
                aria-label={`Página ${n}`}
                onClick={() => onPage(n)}
              >
                {n}
              </Button>
            ))}
            <Button
              variant="ghost"
              disabled={current === pages}
              onClick={() => onPage(current + 1)}
            >
              Siguiente
            </Button>
            <Button
              variant="ghost"
              disabled={current === pages}
              onClick={() => onPage(pages)}
              aria-label="Última página"
            >
              »
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}
