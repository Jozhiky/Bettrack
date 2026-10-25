import { z } from 'zod';
export const automaticPolicySchema = z
  .object({
    version: z.literal('automatic-captures-v1'),
    policyId: z.string().min(1),
    ownerId: z.string().min(1),
    enabledAt: z.iso.datetime(),
  })
  .strict();
export type AutomaticPolicy = z.infer<typeof automaticPolicySchema>;
export function eligibleAutomaticPolicy(raw: unknown, ownerId: string, createdAt: string) {
  const r = automaticPolicySchema.safeParse(raw);
  return r.success &&
    r.data.ownerId === ownerId &&
    ownerId &&
    Date.parse(createdAt) >= Date.parse(r.data.enabledAt) &&
    Date.parse(r.data.enabledAt) <= Date.now()
    ? r.data
    : undefined;
}
