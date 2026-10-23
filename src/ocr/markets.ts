// Recognition vocabulary only, never settlement rules. Preserve the original
// market text: player/team, period, Asian line and qualifiers are significant.
// Sources and coverage boundaries: docs/OCR_MARKETS.md.
// Matching only. Never use this value to replace a displayed name or an ID.
export const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const marketFamilies = [
  {
    id: 'result',
    pattern:
      /\b(?:resultado (?:del |de |al |final\b)|ganador(?:$|\s*\(| (?:del|de la|de) (?:(?:primer|primera|segundo|segunda|tercer|tercera|cuarto|cuarta|quinto|quinta|siguiente|proximo|\d+[ºªo]?) )?(?:partido|encuentro|tiempo|set|juego|cuarto|mitad|periodo|mapa|ronda)\b)|ganara|clasifica(?:cion)?$|doble oportunidad|empate no valido|empate apuesta no valida|sin empate|1x2$)/,
  },
  {
    id: 'score',
    pattern:
      /\b(?:marcador (?:correcto|exacto|al descanso|del (?:partido|juego|set))|resultado exacto|descanso\s*\/\s*final|mitad\s*\/\s*final|margen de victoria)/,
  },
  {
    id: 'scorer',
    pattern:
      /\b(?:anotar en cualquier momento|anotara en cualquier momento|(?:primer|ultimo|proximo) goleador|goleador(?:es)?|jugador que anota|anota o (?:da una |dara una )?asistencia|marcara? en cualquier momento|equipo que (?:anota|marca)|(?:primer|ultimo) equipo en (?:anotar|marcar))/,
  },
  {
    id: 'goals',
    // Singular needs market context. A pick such as "Gol antes del minuto
    // 70:00" or a club such as "Gol Gohar FC" must not become a market.
    pattern: /\bgoles\b|\b(?:proximo|siguiente|primer|ultimo) gol\b|\b(?:tiempo|minuto) del gol\b/,
  },
  { id: 'assists', pattern: /\basistencias?\b/ },
  {
    id: 'shots',
    pattern:
      /\b(?:remates?|tiros? (?:al arco|a (?:la )?puerta|a (?:la )?porteria|totales|fuera|bloqueados))\b|^tiros$/,
  },
  { id: 'corners', pattern: /\b(?:corners?|tiros? de esquina)\b/ },
  { id: 'cards', pattern: /\b(?:tarjetas?|amonestacion(?:es)?|expulsion(?:es)?)\b/ },
  { id: 'both', pattern: /\bambos equipos\b/ },
  { id: 'handicap', pattern: /\b(?:handicap|asiatico|asiatica)\b/ },
  { id: 'totals', pattern: /\bmas\s*\/\s*menos\b/ },
  { id: 'throw-ins', pattern: /\bsaques? de banda\b/ },
  { id: 'goal-kicks', pattern: /\bsaques? de (?:meta|puerta|porteria)\b/ },
  { id: 'offside', pattern: /\b(?:fueras? de juego|offsides?)\b/ },
  { id: 'saves', pattern: /\b(?:atajadas?|paradas? (?:del|de|totales))\b|^paradas$/ },
  {
    id: 'tackles',
    pattern: /\b(?:quites?|entradas? (?:del|de|totales|ganadas|exitosas))\b|^entradas$/,
  },
  {
    id: 'passes',
    pattern:
      /\bpases? (?:del|de|totales|completados|acertados|intentados|clave|exitosos)\b|^pases$/,
  },
  { id: 'fouls', pattern: /\bfaltas? (?:del|de|totales|cometidas|recibidas)|^faltas$/ },
  { id: 'possession', pattern: /\bposesion (?:del balon|de balon|de la pelota)\b/ },
  { id: 'penalties', pattern: /\b(?:penal(?:es)?|penaltis?|tiros? libres?)\b/ },
  {
    id: 'clean-sheet',
    pattern: /\b(?:porteria a cero|valla invicta|arco en cero|ganar sin recibir|ganar a cero)\b/,
  },
  // Other sports: lexical coverage; their ticket layouts require real fixtures.
  {
    id: 'points',
    pattern:
      /\b(?:total de puntos|puntos (?:del|de|totales|en)|puntos\s*\+|(?:cuarto|mitad|periodo) con mas puntos)|\bpuntos$/,
  },
  { id: 'rebounds', pattern: /\brebotes?\b/ },
  { id: 'basketball', pattern: /\b(?:triples|robos|tapones|doble doble|triple doble)\b/ },
  {
    id: 'tennis',
    pattern:
      /\b(?:total (?:de|del) (?:sets?|juegos?)|aces|dobles faltas|tie[- ]?break|quiebres de servicio)\b/,
  },
  { id: 'baseball', pattern: /\btotal de carreras\b/ },
  {
    id: 'esports',
    pattern:
      /\b(?:total de mapas|duelos entre jugadores|primer equipo en alcanzar|si habra tiempo extra)\b/,
  },
  { id: 'parity', pattern: /\bpar\s*(?:o|\/)\s*impar\b/ },
  { id: 'rounds', pattern: /\b(?:total de asaltos|total de rondas|metodo de victoria)\b/ },
] as const;

// Short picks must survive layout cleaning (including a sign or decimal).
export const isSelectionValue = (text: string) =>
  /^(?:[+\-−]?\d+(?:[.,]\d+)?(?:\+|\s*[-–/:]\s*\d+(?:[.,]\d+)?)?|1x|x2|12|x|si|no)$/i.test(
    normalized(text),
  );

// These are incomplete labels by themselves. Join only AFTER a recognized
// market, never use them to invent a market or absorb an unknown team name.
export const isMarketContinuation = (text: string) =>
  /^(?:\(?(?:(?:en|del|de la) )?(?:(?:primer|primera|segundo|segunda|tercer|tercera|cuarto|cuarta|quinto|quinta|\d+[ºªo]?) (?:tiempo|mitad|cuarto|periodo|set|juego)|(?:tiempo reglamentario|partido completo)|(?:incluye|incluida|incluido|con|sin) (?:la |el )?(?:prorroga|tiempo extra)|(?:set|juego) (?:actual|siguiente))\)?|\(?\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\)?)$/.test(
    normalized(text),
  );

export function marketFamily(text: string): string | undefined {
  const value = normalized(text);
  // Values are selections, including signed/Asian lines, not market labels.
  if (
    isSelectionValue(value) ||
    /^(?:mas de|menos(?: de)?|[+\-−]?\d+(?:[.,]\d+)?\s*(?:\+|$)|si$|no$)/.test(value)
  )
    return;
  return marketFamilies.find((f) => f.pattern.test(value))?.id;
}
export const isMarketLine = (text: string) => marketFamily(text) !== undefined;

// A notice about one leg is not a team, a market, or settlement of the ticket.
export const isSelectionNotice = (text: string) =>
  /^(?:ganad[oa] con pago anticipado|pago anticipado aplicado|seleccion (?:ganada|perdida|anulada))$/.test(
    normalized(text),
  );
