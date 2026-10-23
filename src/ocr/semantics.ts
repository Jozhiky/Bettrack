import { marketFamily, normalized } from './markets';

export interface MarketInterpretation {
  original: { market: string; pick: string; event: string };
  family: string | null;
  sport: string | null;
  statistic: string | null;
  scope: 'match' | 'team' | 'player' | 'unknown';
  participant: string | null;
  period:
    | 'first-half'
    | 'second-half'
    | 'first-period'
    | 'second-period'
    | 'third-period'
    | 'fourth-period'
    | 'full-match'
    | 'unspecified';
  operator: 'over' | 'under' | 'at-least' | 'handicap' | 'yes' | 'no' | null;
  threshold: number | null;
  confidence: Record<string, 'recognized' | 'review' | 'missing'>;
}

// Interpret evidence, not bookmaker settlement rules. Unknown qualifiers and
// participant kinds remain unknown. Folding is restricted to label matching;
// it is never an identity key and never rewrites the OCR text.
export function interpretMarket(
  market: string,
  pick: string,
  event = '',
  sport = '',
): MarketInterpretation {
  const label = normalized(market),
    value = normalized(pick);
  const family = marketFamily(market) ?? null;
  const period: MarketInterpretation['period'] =
    /\b(?:primer|primera|1[ºoa]?) (?:tiempo|mitad)\b/.test(label)
      ? 'first-half'
      : /\b(?:segundo|segunda|2[ºoa]?) (?:tiempo|mitad)\b/.test(label)
        ? 'second-half'
        : /\b(?:primer|primero|1[ºoa]?) (?:periodo|cuarto)\b/.test(label)
          ? 'first-period'
          : /\b(?:segundo|2[ºoa]?) (?:periodo|cuarto)\b/.test(label)
            ? 'second-period'
            : /\b(?:tercer|tercero|3[ºoa]?) (?:periodo|cuarto)\b/.test(label)
              ? 'third-period'
              : /\b(?:cuarto|4[ºoa]?) (?:periodo|cuarto)\b/.test(label)
                ? 'fourth-period'
                : /\b(?:partido completo|tiempo reglamentario)\b/.test(label)
                  ? 'full-match'
                  : 'unspecified';
  const statistic = !family
    ? null
    : /\bhandicap\b/.test(label)
      ? 'handicap'
      : /puntos\s*\+\s*rebotes\s*\+\s*asistencias/.test(label)
        ? 'points+rebounds+assists'
        : /(?:tiros?|remates?) (?:al arco|a (?:la )?(?:puerta|porteria))/.test(label)
          ? 'shots-on-target'
          : family === 'shots'
            ? 'shots'
            : /\b(?:proximo|siguiente) gol\b/.test(label)
              ? 'next-goal'
              : [
                    'goals',
                    'corners',
                    'saves',
                    'assists',
                    'points',
                    'rebounds',
                    'handicap',
                    'scorer',
                  ].includes(family)
                ? family
                : /ambos equipos anotan/.test(label)
                  ? 'both-teams-to-score'
                  : /tarjeta/.test(label)
                    ? 'cards'
                    : family;

  // A name must match an observed event participant exactly (NFC/case/space).
  // Accent folding a name could merge two distinct entities, so do not do it.
  const identity = (s: string) =>
    s.normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
  const originalLabel = market.normalize('NFC');
  const participants = event.split(/\s+vs?\.?\s+/i);
  const matches = participants.filter(
    (name) =>
      name &&
      ((identity(originalLabel).startsWith(`${identity(name)} `) &&
        /^(?:[-–]\s*)?(?:goles|corners|tiros|remates|puntos|atajadas|asistencias)\b/.test(
          normalized(originalLabel.slice(name.normalize('NFC').length).trim()),
        )) ||
        identity(originalLabel).endsWith(` de ${identity(name)}`)),
  );
  let scope: MarketInterpretation['scope'] = 'unknown';
  let participant: string | null = null;
  if (family && matches.length === 1 && participants.length === 2) {
    scope = /^(?:tenis|tennis|badminton|boxeo)$/.test(normalized(sport)) ? 'player' : 'team';
    participant = matches[0];
  } else if (family && /\bjugador\b/.test(label)) {
    scope = 'player';
  } else if (
    family &&
    /\b(?:del equipo|de un equipo|equipo local|equipo visitante)\b/.test(label)
  ) {
    scope = 'team';
  } else if (family && isMatchLabel(label)) {
    scope = 'match';
  }
  // Unidentified leading names are retained, without assuming player vs team.
  if (family && !participant && scope === 'unknown') {
    const at = originalLabel.search(
      /\s+(?:[-–]\s*)?(?:Tiros|Remates|Goles|C[oó]rners|Puntos|Atajadas|Asistencias)\b/i,
    );
    if (at > 0) participant = originalLabel.slice(0, at).trim();
  }
  let operator: MarketInterpretation['operator'] = null;
  let threshold: number | null = null;
  const total = value.match(/^(mas de|menos de)\s+(\d+(?:[.,]\d+)?)$/);
  const minimum = value.match(/^(\d+(?:[.,]\d+)?)\s*\+$/);
  const handicap = statistic === 'handicap' && value.match(/(?:^|\s)([+−-]\d+(?:[.,]\d+)?)$/);
  if (total) {
    operator = total[1] === 'mas de' ? 'over' : 'under';
    threshold = Number(total[2].replace(',', '.'));
  } else if (minimum) {
    operator = 'at-least';
    threshold = Number(minimum[1].replace(',', '.'));
  } else if (handicap) {
    operator = 'handicap';
    threshold = Number(handicap[1].replace('−', '-').replace(',', '.'));
  } else if (/^(si|no)$/.test(value)) operator = value === 'si' ? 'yes' : 'no';

  return {
    original: { market, pick, event },
    family,
    // Points are not proof of NBA, nor goals proof of football (e.g. hockey).
    sport: sport || null,
    statistic,
    scope,
    participant,
    period,
    operator,
    threshold,
    confidence: {
      market: family ? 'recognized' : market ? 'review' : 'missing',
      sport: sport ? 'recognized' : 'missing',
      participant:
        participant && matches.length === 1 ? 'recognized' : participant ? 'review' : 'missing',
      scope: scope === 'unknown' ? 'review' : 'recognized',
      period: period === 'unspecified' ? 'missing' : 'recognized',
      selection: operator ? 'recognized' : pick ? 'review' : 'missing',
    },
  };
}

function isMatchLabel(label: string) {
  // Only whole grammatical labels establish match scope. Unknown trailing
  // names/qualifiers must not be silently converted into match totals.
  const base = label
    .replace(
      /\s+(?:(?:en|del|de la) )?(?:primer|primera|segundo|segunda|tercer|tercero|cuarto|1[ºoa]?|2[ºoa]?|3[ºoa]?|4[ºoa]?) (?:tiempo|mitad|periodo|cuarto)\b/g,
      '',
    )
    .replace(/\s+(?:del )?(?:partido completo|tiempo reglamentario)\b/g, '')
    .replace(/\s*mas\s*\/\s*menos\s*/g, ' ')
    .trim();
  return /^(?:(?:total de )?(?:goles|corners|puntos)(?: totales)?|(?:tiros|remates)(?: totales| al arco| a (?:la )?(?:puerta|porteria))?|resultado del partido(?: \(1x2\))?|doble oportunidad|ambos equipos (?:anotan|reciben una tarjeta)|(?:proximo|siguiente) gol(?: antes de \d{1,2}:\d{2}(?: \(gol \d+\))?)?)$/.test(
    base,
  );
}
