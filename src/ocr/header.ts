// Betano uses Doble/Triple instead of Combinada on some tickets. These are
// aliases, not new domain types. A market such as Doble oportunidad is NOT a header.
export function betanoHeader(text: string) {
  const match = text
    .trim()
    .match(/^(simple|doble|triple|combinada(?:\s+de\s+(\d+))?|bet builder)(?=\s+[S$5]\s*\/|\s*$)/i);
  if (!match) return;
  const label = match[1].toLowerCase();
  return {
    kind: label === 'simple' ? 'Simple' : 'Combinada',
    expectedSelections:
      label === 'simple'
        ? 1
        : label === 'doble'
          ? 2
          : label === 'triple'
            ? 3
            : match[2]
              ? Number(match[2])
              : undefined,
  };
}


// A settled ticket can print its GLOBAL state in the same header row:
// "Simple S/10.00 Perdida". Never interpret a lost selection, free text, or
// bookmaker action ("Cerrar apuesta") as a ticket-level settlement.
// Require the exact Betano ticket header + stake + terminal status.
export function settledTicketHeader(line: string): 'Ganada' | 'Perdida' | undefined {
  if (!betanoHeader(line)) return undefined;
  const match = line.trim().match(
    /^(?:simple|doble|triple|combinada(?:\s+de\s+\d+)?|bet builder)\s+[S$5]\s*\/\s*\d+[.,]\d{2}\s+(ganada|perdida)$/i,
  );
  if (!match) return undefined;
  return match[1].toLowerCase() === 'ganada' ? 'Ganada' : 'Perdida';
}
