import { CloudConflictError } from './cloudStore';
// Only retry a rejected compare-and-swap, after CloudStore has loaded the
// authoritative state. Unknown/network outcomes are never treated as conflicts.
export async function retryCaptureConflict<T>(operation: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof CloudConflictError) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
}
