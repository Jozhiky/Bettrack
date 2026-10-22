import { useSyncExternalStore } from 'react';
type Activity = { phase: 'reading' | 'saving'; progress: number };
const entries = new Map<string, Activity>();
const listeners = new Set<() => void>();
export function captureActivity(id: string, value?: Activity) {
  if (value) entries.set(id, value); else entries.delete(id);
  listeners.forEach(fn => fn());
}
export function useCaptureActivity(id: string) {
  return useSyncExternalStore(
    callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    () => entries.get(id),
  );
}
