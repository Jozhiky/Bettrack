import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { defaultSettings, emptySnapshot, type Settings } from '../domain/model';
import { AutomaticCaptureSettings } from '../components/AutomaticCaptureSettings';
import { AutomaticCaptureBatch } from '../components/AutomaticCaptureBatch';
const mocks = vi.hoisted(() => ({
  settings: {} as Settings,
  toggle: vi.fn().mockResolvedValue(undefined),
  run: vi.fn(async (fn: () => Promise<unknown>) => {
    await fn();
    return true;
  }),
}));
vi.mock('../app/context', () => ({
  useApp: () => ({ settings: mocks.settings, data: emptySnapshot, run: mocks.run }),
}));
vi.mock('../data/automaticCapturePolicy', () => ({ setAutomaticCaptures: mocks.toggle }));
vi.mock('../data/captures', () => ({ confirmAutomaticBatch: vi.fn() }));
vi.mock('../data/captureVisualMode', () => ({
  enrichCaptureModes: vi.fn().mockResolvedValue({ failed: 0 }),
}));
vi.mock('../data/captureReceipt', () => ({
  enrichCaptureReceipts: vi.fn().mockResolvedValue({ failed: 0 }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const policy = {
  version: 'automatic-captures-v1' as const,
  policyId: 'synthetic-policy',
  ownerId: 'synthetic-account',
  enabledAt: new Date().toISOString(),
};
it('explains one-time financial authorization and does not enable on mount; activation locks double clicks', async () => {
  mocks.settings = defaultSettings;
  render(<AutomaticCaptureSettings />);
  expect(mocks.toggle).not.toHaveBeenCalled();
  expect(screen.getByRole('region')).toHaveTextContent('autorizas los cargos y retornos');
  const button = screen.getByRole('button', { name: 'Activar y autorizar registro automático' });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(mocks.toggle).toHaveBeenCalledOnce());
  expect(mocks.toggle).toHaveBeenCalledWith(true);
});
it('offers revocation in the same panel', async () => {
  mocks.settings = { ...defaultSettings, automaticCaptures: policy };
  render(<AutomaticCaptureSettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar registro automático' }));
  await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith(false));
});
it('does not require a batch button in the authorized automatic mode', () => {
  mocks.settings = { ...defaultSettings, automaticCaptures: policy };
  render(
    <AutomaticCaptureBatch
      uploads={[
        {
          id: 'synthetic',
          imageId: 'synthetic-image',
          createdAt: new Date().toISOString(),
          status: 'review',
          reason: '',
          progress: 100,
          draftJson: JSON.stringify({
            house: 'Betano',
            kind: 'Simple',
            stake: 1000,
            text: 'Betano\nSimple S/10.00 Perdida\nApuesta S/10.00',
            selections: [],
            warnings: [],
            confidence: {},
          }),
        },
      ]}
    />,
  );
  expect(screen.getByRole('region')).toHaveTextContent('no pide confirmar lotes');
  expect(screen.queryByRole('button', { name: /Confirmar y registrar/ })).not.toBeInTheDocument();
});
