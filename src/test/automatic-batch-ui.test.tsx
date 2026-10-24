import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
import type { CaptureUpload } from '../domain/model';
import { AutomaticCaptureBatch } from '../components/AutomaticCaptureBatch';
import { enrichCaptureModes } from '../data/captureVisualMode';
const mocks = vi.hoisted(() => ({
  confirm: vi.fn().mockResolvedValue({ saved: 1, duplicates: 0 }),
  run: vi.fn(async (fn: () => Promise<unknown>) => {
    await fn();
    return true;
  }),
}));
vi.mock('../data/captures', () => ({ confirmAutomaticBatch: mocks.confirm }));
vi.mock('../data/captureVisualMode', () => ({
  enrichCaptureModes: vi.fn().mockResolvedValue({ enriched: 0, failed: 0 }),
}));
vi.mock('../app/context', () => ({
  useApp: () => ({ run: mocks.run }),
  useModalError: () => null,
}));
afterEach(() => {
  cleanup();
  mocks.confirm.mockClear();
});
function upload(kind: string, payout: string): CaptureUpload {
  return {
    id: kind,
    imageId: 'image-' + kind,
    status: 'review',
    createdAt: '2026-10-20T16:00:00Z',
    progress: 100,
    reason: 'Revisa fechas',
    draftJson: JSON.stringify({
      house: 'Betano',
      kind: 'Simple',
      stake: 10000,
      text: `Betano\nSimple S/100.00 ${kind}\nEquipo QA vs. Equipo QB Hoy 18:00\nApuesta S/100.00\n${payout}`,
      selections: [
        {
          event: 'Equipo QA vs. Equipo QB',
          market: 'Goles totales Más/Menos',
          pick: 'Más 2.5',
          odds: 2,
          sport: '',
          league: '',
        },
      ],
      warnings: [],
      confidence: {},
    }),
  };
}
it('prepares a visible consolidated summary without dates or per-ticket review; writes only after consent and blocks double click', async () => {
  render(
    <AutomaticCaptureBatch
      uploads={[upload('Ganada', 'Ganancias S/140.00'), upload('Cash Out', 'CASH OUT S/80.00')]}
    />,
  );
  expect(
    screen.getByRole('region', { name: 'Importación automática de liquidadas' }),
  ).toHaveTextContent('S/ 40.00');
  expect(screen.queryByLabelText('Fecha de apuesta')).not.toBeInTheDocument();
  expect(mocks.confirm).not.toHaveBeenCalled();
  const button = screen.getByRole('button', { name: 'Confirmar y registrar 1 liquidadas' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 registradas'));
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.confirm.mock.calls[0][0]).toHaveLength(1);
  expect(mocks.confirm.mock.calls[0][1]).toBe(true);
});
it('lets the user exclude a ticket without editing it', () => {
  render(<AutomaticCaptureBatch uploads={[upload('Perdida', '')]} />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'Confirmar y registrar 0 liquidadas' })).toBeDisabled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it('finishes the visual scan when the refreshed draft gains its icon evidence', async () => {
  let finish!: (v: { enriched: number; failed: number }) => void;
  vi.mocked(enrichCaptureModes).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const u = upload('Ganada', 'Ganancias S/140.00'),
    view = render(<AutomaticCaptureBatch uploads={[u]} />);
  const button = screen.getByRole('button', { name: 'Confirmar y registrar 1 liquidadas' });
  expect(button).toBeDisabled();
  const draft = JSON.parse(u.draftJson);
  draft.visualMode = {
    mode: 'live',
    basis: 'betano-orange-lightning-v1',
    imageHash: 'a'.repeat(64),
    bbox: { x0: 0.89, y0: 0.54, x1: 0.92, y1: 0.59 },
  };
  view.rerender(<AutomaticCaptureBatch uploads={[{ ...u, draftJson: JSON.stringify(draft) }]} />);
  finish({ enriched: 1, failed: 0 });
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByText('⚡ En vivo')).toBeVisible();
});
