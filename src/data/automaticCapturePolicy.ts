import { repo } from './repository';
import { transact, cloudStore } from './cloudStore';
import { automaticPolicySchema, eligibleAutomaticPolicy } from '../domain/automaticPolicy';
import { id, timestamp } from '../domain/model';
export async function setAutomaticCaptures(
  enabled: boolean,
  repository = repo,
  ownerId = cloudStore.userId,
) {
  if (!ownerId) throw Error('Inicia sesión para cambiar el registro automático.');
  if (repository === repo && ownerId !== cloudStore.userId)
    throw Error('La autorización corresponde a otra cuenta.');
  const generation = cloudStore.generation,
    d = repository.database;
  await transact(d, 'rw', [d.settings, d.audit], async (scope) => {
    if (repository === repo && generation !== cloudStore.generation)
      throw Error('La sesión cambió.');
    const before = await scope.settings.get('settings');
    if (!before) throw Error('No se encuentra la configuración de la cuenta.');
    const policy = enabled
      ? automaticPolicySchema.parse({
          version: 'automatic-captures-v1',
          policyId: id(),
          ownerId,
          enabledAt: timestamp(),
        })
      : undefined;
    await scope.settings.put({ ...before, automaticCaptures: policy });
    await scope.audit.add({
      id: id(),
      date: timestamp(),
      action: enabled
        ? 'Autorizar registro automático de capturas'
        : 'Desactivar registro automático de capturas',
      entityId: policy?.policyId ?? before.automaticCaptures?.policyId ?? 'settings',
      before: JSON.stringify(before.automaticCaptures ?? null),
      after: JSON.stringify({
        policy,
        scope: 'new-uploads-after-activation',
        perBatchConfirmation: false,
        financialWrite: false,
      }),
    });
  });
}
export function captureAccountId(repository = repo) {
  const d = repository.database as unknown as { userId?: string };
  return 'userId' in d ? (d.userId ?? '') : 'isolated-test';
}
export async function automaticCapturePolicy(
  repository = repo,
  createdAt = new Date().toISOString(),
) {
  const d = repository.database,
    settings = await d.settings.get('settings');
  const policy = eligibleAutomaticPolicy(
    settings?.automaticCaptures,
    captureAccountId(repository),
    createdAt,
  );
  if (!policy) return;
  const audits = await d.audit.where('entityId').equals(policy.policyId).toArray();
  if (audits.some((a) => a.action === 'Desactivar registro automático de capturas')) return;
  return audits.some((a) => {
    if (a.action !== 'Autorizar registro automático de capturas') return false;
    try {
      return JSON.stringify(JSON.parse(a.after).policy) === JSON.stringify(policy);
    } catch {
      return false;
    }
  })
    ? policy
    : undefined;
}
