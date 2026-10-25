import { repo } from './repository';
import { cloudStore, transact } from './cloudStore';
import { readDraft } from '../ocr/review';
import { needsReceiptRead, settlementEvidence } from '../ocr/settlement';
import { readReceiptFooter, receiptOcrSchema } from '../ocr/receiptOcr';
import { id, timestamp } from '../domain/model';

// Draft/audit writes only. Never register, settle or change stored bets here.
export async function enrichCaptureReceipts(
  uploadIds: string[],
  repository = repo,
  reader = readReceiptFooter,
) {
  const d = repository.database,
    generation = cloudStore.generation;
  let enriched = 0,
    failed = 0;
  for (const uploadId of new Set(uploadIds)) {
    try {
      const upload = await d.uploads.get(uploadId),
        draft = upload && readDraft(upload.draftJson);
      if (
        !upload ||
        !['review', 'error'].includes(upload.status) ||
        !draft ||
        !needsReceiptRead(draft)
      )
        continue;
      const image = await d.images.get(upload.imageId);
      if (!image || !/^[a-f0-9]{64}$/.test(image.hash)) continue;
      const raw = await reader(image.blob, image.hash);
      if (!raw) continue;
      const proof = receiptOcrSchema.parse(raw);
      if (proof.imageHash !== image.hash)
        throw Error('La lectura del cobro corresponde a otra imagen.');
      if (!settlementEvidence({ ...draft, receiptOcr: proof }).receiptPaid) continue;
      await transact(d, 'rw', [d.uploads, d.images, d.audit], async (scope) => {
        if (repository === repo && generation !== cloudStore.generation)
          throw Error('La sesión cambió.');
        const current = await scope.uploads.get(uploadId),
          currentImage = await scope.images.where('id').equals(upload.imageId).first();
        if (
          !current ||
          !['review', 'error'].includes(current.status) ||
          current.draftJson !== upload.draftJson ||
          current.imageId !== upload.imageId ||
          currentImage?.hash !== proof.imageHash
        )
          return;
        await scope.uploads.update(uploadId, {
          draftJson: JSON.stringify({ ...JSON.parse(current.draftJson), receiptOcr: proof }),
        });
        await scope.audit.add({
          id: id(),
          date: timestamp(),
          action: 'Recuperar lectura de cobro de captura',
          entityId: uploadId,
          before: current.draftJson,
          after: JSON.stringify({
            imageId: upload.imageId,
            receiptOcr: proof,
            financialWrite: false,
          }),
        });
        enriched++;
      });
    } catch {
      failed++;
    }
  }
  return { enriched, failed };
}
