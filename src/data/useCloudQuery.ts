import { useEffect, useState } from 'react';
import { cloudStore } from './cloudStore';
export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[], fallback: T): T;
export function useLiveQuery<T>(query: () => Promise<T>, deps?: unknown[]): T | undefined;
export function useLiveQuery<T>(query: () => Promise<T>, deps: unknown[] = [], fallback?: T): T | undefined {
  const [value, setValue] = useState<T | undefined>(fallback);
  useEffect(() => {
    let alive = true, sequence = 0;
    const update = () => { const current = ++sequence; void query().then(result => { if (alive && current === sequence) setValue(result); }).catch(() => {}); };
    const unsubscribe = cloudStore.subscribe(update); update();
    return () => { alive = false; unsubscribe(); };
  }, deps);
  return value;
}
