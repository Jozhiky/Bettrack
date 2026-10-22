import { it, expect, vi } from 'vitest';
import { ImageCache } from '../data/imageCache';
it('coalesces concurrent downloads and uses bounded LRU memory', async () => {
  const cache = new ImageCache(6);
  const download = vi.fn(async()=>new Blob(['abc']));
  const [a,b] = await Promise.all([cache.get('a', download), cache.get('a', download)]);
  expect(a).toBe(b); expect(download).toHaveBeenCalledTimes(1);
  await cache.get('b',download);
  await cache.get('a',download);
  await cache.get('c',download);
  expect(download).toHaveBeenCalledTimes(3);
  await cache.get('b',download);
  expect(download).toHaveBeenCalledTimes(4);
});
it('does not retain downloads from a previous account after reset', async () => {
  const cache = new ImageCache();
  let done!: (blob:Blob)=>void;
  const pending = cache.get('same',()=>new Promise(resolve=>{done=resolve;}));
  cache.clear();
  done(new Blob(['old']));
  await pending;
  const download = vi.fn(async()=>new Blob(['new']));
  await cache.get('same',download);
  expect(download).toHaveBeenCalledOnce();
  cache.retain(new Set());
  await cache.get('same',download);
  expect(download).toHaveBeenCalledTimes(2);
});
