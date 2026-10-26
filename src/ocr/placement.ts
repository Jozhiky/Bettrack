import { normalized } from './markets';
import { settledTicketHeader } from './header';
import { builderProductTitle } from './bet365';

// Draft evidence only. This is independent of Pendiente/Ganada/Perdida/Cashout
// and does not change the persisted Bet or financial schemas.
export interface PlacementEvidence {
  status: 'preparation' | 'confirmed' | 'unknown';
  evidence: string[];
  basis:
    | 'creation-action'
    | 'receipt'
    | 'settled-header'
    | 'cashout-available'
    | 'selection-result'
    | 'conflicting'
    | 'insufficient';
}

export function classifyPlacement(text: string, cashoutAvailable: boolean): PlacementEvidence {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preparation = lines.filter((line) => {
    if (builderProductTitle(line)) return false;
    const value = normalized(line);
    return (
      /^(?:crear|confirmar|realizar|colocar|hacer) (?:la |mi )?apuesta\b/.test(value) ||
      /^(?:apuesta )?pendiente de (?:confirmacion|colocacion|aceptacion)\b/.test(value) ||
      /^apuesta (?:no (?:confirmada|aceptada|colocada|realizada)|rechazada|en preparacion)\b/.test(
        value,
      )
    );
  });
  // Anchor whole receipt messages: instructions, negations and conditional
  // phrases such as "apuesta confirmada si..." are not acceptance evidence.
  const receipts = lines.filter((line) =>
    /^(?:(?:tu|su|la) )?apuesta (?:ha sido )?(?:realizada|colocada|aceptada|confirmada|registrada)(?: (?:con exito|correctamente|exitosamente))?[.!]?$/.test(
      normalized(line),
    ),
  );
  // A global Ganada/Perdida ticket header proves an already placed wager,
  // but only with the Betano brand present in the OCR evidence. Do not
  // transfer this conclusion to another bookmaker or to a selection icon.
  const settledHeaders = /\bbetano\b/i.test(text)
    ? lines.filter((line) => settledTicketHeader(line) !== undefined)
    : [];
  if (preparation.length && (receipts.length || cashoutAvailable || settledHeaders.length))
    return {
      status: 'unknown',
      basis: 'conflicting',
      evidence: [...preparation, ...receipts, ...settledHeaders],
    };
  if (preparation.length)
    return { status: 'preparation', basis: 'creation-action', evidence: preparation };
  if (receipts.length) return { status: 'confirmed', basis: 'receipt', evidence: receipts };
  if (settledHeaders.length === 1)
    return { status: 'confirmed', basis: 'settled-header', evidence: settledHeaders };
  // Only the contextual cashout reader supplies this flag, never stored draft
  // metadata. An available offer supports placement, not execution/settlement.
  if (cashoutAvailable)
    return {
      status: 'confirmed',
      basis: 'cashout-available',
      evidence: lines.filter((line) => /cash\s*ou[tIi]/i.test(line)),
    };
  return { status: 'unknown', basis: 'insufficient', evidence: [] };
}

export function placementReviewReason(placement: PlacementEvidence): string | undefined {
  if (placement.status === 'preparation')
    return 'Boleto en preparación: falta confirmar su colocación en Betano. Conservamos la captura y el borrador; no se ha descontado el stake.';
  if (placement.status === 'unknown')
    return placement.basis === 'conflicting'
      ? 'La captura mezcla señales de preparación y colocación. Sube el comprobante de la apuesta confirmada; no se ha descontado el stake.'
      : 'No se pudo confirmar que el boleto ya esté colocado. Sube el comprobante confirmado o una captura con cashout disponible. «Pendiente» por sí solo no confirma la colocación; no se ha descontado el stake.';
}
