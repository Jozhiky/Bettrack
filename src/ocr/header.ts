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
