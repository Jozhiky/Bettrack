import { describe, expect, it } from 'vitest';
import { settledTicketHeader } from '../ocr/header';
import { parseTicket, placementFromText } from '../ocr/parser';

describe('FASE 4C.1: global settlement on a Betano ticket header', () => {
  it.each([
    ['Simple S/10.00 Perdida', 'Simple', 'Perdida'],
    ['Doble S/10.00 Perdida', 'Combinada', 'Perdida'],
    ['Combinada de 4 S/25.00 Ganada', 'Combinada', 'Ganada'],
  ] as const)('recognizes %s at ticket level', (header, kind, expected) => {
    const raw = 'Betano\n' + header + '\nMercado del boleto';
    const parsed = parseTicket(raw);
    expect(settledTicketHeader(header)).toBe(expected);
    expect(parsed.kind).toBe(kind);
    expect(parsed.visibleStatus).toBe(expected);
    expect(parsed.placement).toMatchObject({
      status: 'confirmed',
      basis: 'settled-header',
      evidence: [header],
    });
    expect(placementFromText(parsed.text).status).toBe('confirmed');
    expect(parsed.cashoutOffer).toBeUndefined();
  });

  it.each([
    'Más de 1.5 goles Perdida',
    'Doble oportunidad S/10.00 Perdida',
    'Simple S/10.00 Perdida parcial',
    'Simple S/10.00 Perdida cashout',
    'Crear apuesta S/10.00',
    'Cerrar apuesta S/10.00',
  ])('never treats %s as a globally settled ticket', (line) => {
    const raw = 'Betano\n' + line;
    expect(settledTicketHeader(line)).toBeUndefined();
    expect(placementFromText(raw).status).not.toBe('confirmed');
  });

  it('does not promote a matching header from bet365 without bookmaker-specific evidence', () => {
    const parsed = parseTicket('bet365\nSimple S/10.00 Perdida');
    expect(parsed.placement?.status).toBe('unknown');
    expect(parsed.visibleStatus).toBeUndefined();
  });

  it('blocks conflicts between a settled ticket header and a creation action', () => {
    const parsed = parseTicket('Betano\nSimple S/10.00 Perdida\nCrear apuesta');
    expect(parsed.placement?.status).toBe('unknown');
    expect(parsed.placement?.basis).toBe('conflicting');
    expect(parsed.visibleStatus).toBe('Perdida');
  });

  it('keeps settled status distinct from a cashout OFFER, not a payout', () => {
    const parsed = parseTicket('Betano\nSimple S/10.00 Perdida\nCASH OUT S/3.00');
    expect(parsed.visibleStatus).toBe('Perdida');
    expect(parsed.cashoutOffer).toBe(300);
    expect(parsed.placement?.status).toBe('confirmed');
    // An offered cashout must not become an executed cashout.
    expect(parsed.visibleStatus).not.toBe('Cashout');
  });
});
