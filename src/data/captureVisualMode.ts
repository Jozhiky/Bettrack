import { repo } from './repository';
import { cloudStore, transact } from './cloudStore';
import { runBatch } from './batch';
import { readDraft } from '../ocr/review';
import { readVisualMode, visualModeSchema } from '../ocr/visualMode';
import { id, timestamp } from '../domain/model';

// Enrich review drafts only. Original text, image, selections, holds and money
// remain unchanged; registered bets/settlements/movements are never rewritten.
export async function enrichCaptureModes(
  uploadIds: string[],
  repository = repo,
  reader = readVisualMode,
) {
  const d = repository.database,
    generation = cloudStore.generation;
  const reads = await runBatch([...new Set(uploadIds)], 2, async (uploadId) => {
    const upload = await d.uploads.get(uploadId),
      draft = upload && readDraft(upload.draftJson);
    if (
      !upload ||
      !['review', 'error'].includes(upload.status) ||
      draft?.house !== 'Betano' ||
      draft.visualMode
    )
      return;
    const image = await d.images.get(upload.imageId);
    if (!image || !/^[a-f0-9]{64}$/.test(image.hash)) return;
    const found = await reader(image.blob, image.hash);
    if (!found) return;
    const checked = visualModeSchema.safeParse(found);
    if (!checked.success || checked.data.imageHash !== image.hash)
      throw Error('La modalidad visual no corresponde a la imagen.');
    return { uploadId, imageId: upload.imageId, mode: checked.data };
  });
  const proofs = reads.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  let enriched = 0;
  if (proofs.length)
    await transact(d, 'rw', [d.uploads, d.images, d.audit], async (scope) => {
      if (repository === repo && generation !== cloudStore.generation)
        throw Error('La sesión cambió durante la lectura visual.');
      for (const proof of proofs) {
        const upload = await scope.uploads.get(proof.uploadId),
          draft = upload && readDraft(upload.draftJson);
        if (
          !upload ||
          !['review', 'error'].includes(upload.status) ||
          upload.imageId !== proof.imageId ||
          draft?.house !== 'Betano' ||
          draft.visualMode
        )
          continue;
        const image = await scope.images.where('id').equals(proof.imageId).first();
        if (image?.hash !== proof.mode.imageHash) continue;
        await scope.uploads.update(upload.id, {
          draftJson: JSON.stringify({ ...JSON.parse(upload.draftJson), visualMode: proof.mode }),
        });
        await scope.audit.add({
          id: id(),
          date: timestamp(),
          action: 'Reconocer modalidad visual de captura',
          entityId: upload.id,
          before: upload.draftJson,
          after: JSON.stringify({
            imageId: proof.imageId,
            visualMode: proof.mode,
            financialWrite: false,
          }),
        });
        enriched++;
      }
    });
  return { enriched, failed: reads.filter((r) => r.status === 'rejected').length };
}
