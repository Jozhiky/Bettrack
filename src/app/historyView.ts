import { useEffect, useLayoutEffect, useState } from 'react';
import { z } from 'zod';
import { useAuth } from './auth';
import { initialFilter } from '../components/Filters';
const schema = z.object({
  filter: z.object({
    period: z.string(),
    house: z.string(),
    streamer: z.string(),
    kind: z.string(),
    state: z.string(),
    start: z.string(),
    end: z.string(),
  }),
  search: z.string(),
  sort: z.enum(['new', 'old', 'stake']),
  page: z.number().int().positive(),
  size: z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(48)]),
  view: z.enum(['cards', 'table']),
  tab: z.enum(['open', 'closed', 'all']),
});
const views = new Map<string, { value?: HistoryView; scroll: number }>();
type HistoryView = z.infer<typeof schema>;
export function useHistoryView() {
  const { user } = useAuth();
  const memory = views.get(user.id) ?? { scroll: 0 };
  views.set(user.id, memory);
  const [value, setValue] = useState<HistoryView>(() => {
    if (memory.value) return memory.value;
    return {
      filter: initialFilter,
      search: '',
      sort: 'new',
      page: 1,
      size: 12,
      view: 'cards',
      tab: 'open',
    };
  });
  useEffect(() => { memory.value = value; }, [value]);
  useLayoutEffect(() => {
    const viewport = document.querySelector<HTMLElement>('.workspace-scroll');
    if (!viewport) return;
    const frame = requestAnimationFrame(() => viewport.scrollTo(0, memory.scroll));
    const save = () => { if (!document.querySelector('[role="dialog"]')) memory.scroll = viewport.scrollTop; };
    viewport.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('scroll', save);
    };
  }, []);
  function update<K extends keyof HistoryView>(field: K, next: HistoryView[K]) {
    setValue((old) => ({ ...old, [field]: next }));
  }
  return { value, update };
}
