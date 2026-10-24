import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { it, expect, vi, afterEach } from 'vitest';
afterEach(cleanup);
import { CaptureReview } from '../components/CaptureReview';
import { parseTicket } from '../ocr/parser';
import { layoutProbe } from '../../tests/ocr-phase1/controlled';
import type { CaptureUpload } from '../domain/model';
const mocks = vi.hoisted(() => ({
  confirm: vi.fn().mockResolvedValue(undefined),
  run: vi.fn(async (f: () => Promise<unknown>) => {
    await f();
    return true;
  }),
}));
vi.mock('../data/captures', () => ({ confirmCaptureReview: mocks.confirm }));
vi.mock('../app/context', () => ({
  useApp: () => ({ run: mocks.run }),
  useModalError: () => null,
}));
function upload(): CaptureUpload {
  const parsed = parseTicket('', layoutProbe().lines);
  parsed.selections[0].odds = null;
  return {
    id: 'u',
    imageId: 'i',
    status: 'review',
    progress: 100,
    reason: 'cuota ausente',
    createdAt: '2026-01-01T12:00:00Z',
    draftJson: JSON.stringify(parsed),
  };
}
it('requires corrected odds, exact preview and a deliberate checkbox before registering', async () => {
  const item = upload(),
    close = vi.fn();
  mocks.confirm.mockClear();
  render(<CaptureReview upload={item} imageUrl="" onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Faltan datos');
  fireEvent.change(screen.getByLabelText('Cuota 1'), { target: { value: '1.33' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  expect(screen.getByRole('dialog', { name: 'Confirmar registro de apuesta' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar y registrar apuesta' })).toBeDisabled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y registrar apuesta' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(mocks.confirm).toHaveBeenCalledWith(
    'u',
    expect.objectContaining({ expectedDraft: item.draftJson, imageId: 'i', acknowledged: true }),
  );
});
it('invalidates a preview when the cloud draft changes instead of signing stale edits', () => {
  const item = upload();
  const { rerender } = render(<CaptureReview upload={item} imageUrl="" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Cuota 1'), { target: { value: '1.33' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  fireEvent.click(screen.getByRole('checkbox'));
  rerender(
    <CaptureReview
      upload={{ ...item, draftJson: item.draftJson + ' ' }}
      imageUrl=""
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('El borrador cambió');
  expect(screen.getByRole('button', { name: 'Confirmar y registrar apuesta' })).toBeDisabled();
});
it('returning to edit revokes consent for the previous preview', () => {
  render(<CaptureReview upload={upload()} imageUrl="" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Cuota 1'), { target: { value: '1.33' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Volver a corregir' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

it.each(['Ganada', 'Perdida'])(
  'shows a globally %s ticket without offering a pending registration',
  (status) => {
    const item = upload();
    const draft = JSON.parse(item.draftJson);
    draft.text += `\nSimple S/10.00 ${status}`;
    item.draftJson = JSON.stringify(draft);
    mocks.confirm.mockClear();
    render(<CaptureReview upload={item} imageUrl="" onClose={() => {}} />);
    expect(screen.getByLabelText('Estado final')).toHaveValue(status);
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Completa fechas históricas');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mocks.confirm).not.toHaveBeenCalled();
  },
);

it('requires actual payout and dates, previews a cashout loss, and sends one consented operation on double click', async () => {
  const item = upload();
  const draft = JSON.parse(item.draftJson);
  draft.text = draft.text.replace(/^CASH OUT.*$/gm, '') + '\nCashout realizado';
  draft.stake = 10000;
  draft.selections[0].odds = 1.33;
  item.draftJson = JSON.stringify(draft);
  mocks.confirm.mockClear();
  let resolve!: () => void;
  mocks.confirm.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const close = vi.fn();
  render(<CaptureReview upload={item} imageUrl="" onClose={close} />);
  expect(screen.getByLabelText('Importe efectivamente recibido')).toHaveValue('');
  expect(screen.getByLabelText('Fecha de apuesta')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Fecha de apuesta'), {
    target: { value: '2026-10-20T10:00' },
  });
  fireEvent.change(screen.getByLabelText('Fecha de liquidación'), {
    target: { value: '2026-10-21T12:00' },
  });
  fireEvent.change(screen.getByLabelText('Importe efectivamente recibido'), {
    target: { value: '70.00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  expect(
    screen.getByRole('region', { name: 'Resumen de importación histórica' }),
  ).toHaveTextContent(/Resultado neto.*-.*30\.00/s);
  const button = screen.getByRole('button', { name: 'Confirmar e importar liquidada' });
  expect(button).toBeDisabled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(mocks.confirm).toHaveBeenCalledWith(
    'u',
    expect.objectContaining({
      acknowledged: true,
      historical: expect.objectContaining({
        kind: 'Cashout',
        returned: 7000,
        closedStake: 10000,
        betDate: '2026-10-20T15:00:00.000Z',
        settlementDate: '2026-10-21T17:00:00.000Z',
      }),
    }),
  );
  resolve();
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it('requires a global decision for an isolated leg badge and preserves receipt seconds in the reviewed preview', async () => {
  const item = upload();
  const draft = JSON.parse(item.draftJson);
  draft.selections[0].odds = 1.33;
  draft.text +=
    '\nGanada\nPago final S/14.00\nFecha de apuesta: 2026-10-20T10:00:32-05:00\nFecha de liquidación: 2026-10-21T12:00:45-05:00';
  item.draftJson = JSON.stringify(draft);
  mocks.confirm.mockClear();
  render(<CaptureReview upload={item} imageUrl="" onClose={() => {}} />);
  expect(screen.getByLabelText('Estado final')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Estado final'), { target: { value: 'Ganada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ver resumen antes de registrar' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e importar liquidada' }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  expect(mocks.confirm).toHaveBeenCalledWith(
    'u',
    expect.objectContaining({
      historical: expect.objectContaining({
        kind: 'Ganada',
        betDate: '2026-10-20T15:00:32.000Z',
        settlementDate: '2026-10-21T17:00:45.000Z',
      }),
    }),
  );
});
