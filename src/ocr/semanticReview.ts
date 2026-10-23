import { interpretMarket, type MarketInterpretation } from './semantics';

interface SelectionEvidence {
  event: string;
  market: string;
  pick: string;
  sport: string;
  builderMarkets?: { market: string; pick: string }[];
}

export function interpretSelections(selections: SelectionEvidence[]) {
  return selections.flatMap((s, i) =>
    (s.builderMarkets ?? [s]).map((m, j) => ({
      path: `selections[${i}]${s.builderMarkets ? `.builderMarkets[${j}]` : ''}`,
      value: interpretMarket(m.market, m.pick, s.event, s.sport),
    })),
  );
}

// Scope changes the meaning of these statistics. Missing optional sport/period,
// or an operator not modelled for a named pick, is not by itself a veto.
const scopeSensitiveStatistics = new Set([
  'goals',
  'corners',
  'shots',
  'shots-on-target',
  'saves',
  'assists',
  'points',
  'rebounds',
  'points+rebounds+assists',
  'scorer',
  'cards',
]);

export function semanticReviewReasons(
  interpretations: { path: string; value: MarketInterpretation }[],
): string[] {
  return interpretations.flatMap(({ path, value }) => {
    let reason: string | undefined;
    if (!value.family) reason = 'mercado sin interpretar';
    else if (value.participant && value.confidence.participant !== 'recognized')
      reason = 'participante sin identificar con suficiente confianza';
    else if ((value.scope === 'team' || value.scope === 'player') && !value.participant)
      reason = 'falta identificar el equipo o jugador del mercado';
    else if (value.scope === 'unknown' && scopeSensitiveStatistics.has(value.statistic ?? ''))
      reason = 'ámbito ambiguo: no se puede distinguir partido, equipo o jugador';
    return reason ? [`${path}: ${reason}. Conservamos el texto original para revisión.`] : [];
  });
}
