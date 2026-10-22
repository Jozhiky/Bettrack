import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button, Modal, Badge } from '../components/ui';
describe('Interfaz accesible', () => {
  it('botones ejecutan su acción', () => {
    const action = vi.fn();
    render(<Button onClick={action}>Guardar apuesta</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar apuesta' }));
    expect(action).toHaveBeenCalledOnce();
  });
  it('modal tiene título accesible y permite cerrar', () => {
    const close = vi.fn();
    render(
      <Modal title="Revisar boleto" onClose={close}>
        <Badge status="Pendiente" />
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Revisar boleto' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
