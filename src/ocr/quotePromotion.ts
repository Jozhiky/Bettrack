import { z } from 'zod';
export const quotePromotionSchema = z
  .object({
    label: z.enum(['Superaumento', 'Super Mejorada']),
    percent: z.number().int().min(1).max(1000).optional(),
    originalOdds: z.number().positive().optional(),
    appliedOdds: z.number().positive().optional(),
  })
  .strict();
export type QuotePromotion = z.infer<typeof quotePromotionSchema>;
// The percentage is a label about odds, not a second payment or a cash bonus.
export function superImproved(text: string): QuotePromotion | undefined {
  const m = text.match(/(?:^|\n)[^\n]*?\b(\d{1,3})\s*%\s*S[UÚ]PER\s+MEJORADA(?:S)?\s*(?:\n|$)/i);
  return m ? { label: 'Super Mejorada', percent: +m[1] } : undefined;
}
