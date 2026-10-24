// Test-only user action for legacy domain tests. Never confirms ambiguous OCR.
import { expect } from 'vitest';
import { registerCapture as read, confirmCaptureReview } from '../data/captures';
import type { LocalRepository } from '../data/repository';
import type { ParsedTicket } from '../ocr/parser';
import { settlementEvidence } from '../ocr/settlement';
export async function registerCapture(id: string, parsed: ParsedTicket, repo: LocalRepository) {
  await read(id, parsed, repo);
  if (settlementEvidence(parsed).candidate) return;
  const upload = await repo.database.uploads.get(id);
  if (upload?.status !== 'review' || !upload.reason.startsWith('Lectura lista.')) return;
  expect(await repo.database.bets.get(id)).toBeUndefined();
  await confirmCaptureReview(
    id,
    {
      expectedDraft: upload.draftJson,
      imageId: upload.imageId,
      selections: parsed.selections,
      acknowledged: true,
    },
    repo,
  );
}
