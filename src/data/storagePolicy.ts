import { position, type Bet, type StoredSettlement, type CaptureUpload } from '../domain/model';
export function releasableImages(imageIds: string[], bets: Bet[], settlements: StoredSettlement[], uploads: CaptureUpload[]) {
  const closed = new Set(bets.filter(b => position(b, settlements).closed && !position(b, settlements).needsReview).map(b => b.id));
  return imageIds.filter(id => {
    const relatedBets = bets.filter(b => b.imageId === id);
    const relatedUploads = uploads.filter(u => u.imageId === id);
    return (relatedBets.length > 0 || relatedUploads.length > 0) &&
      relatedBets.every(b => closed.has(b.id)) &&
      relatedUploads.every(u => ['saved', 'linked'].includes(u.status) && !!u.betId && closed.has(u.betId));
  });
}
