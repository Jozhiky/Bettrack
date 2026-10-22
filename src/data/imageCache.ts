// Bounded session RAM only. No browser storage, shared URLs or persistent cache.
export class ImageCache {
  private values = new Map<string, Blob>();
  private pending = new Map<string, Promise<Blob>>();
  private epoch = 0;
  constructor(private limit = 32 * 1024 * 1024) {}
  clear() { this.epoch++; this.values.clear(); this.pending.clear(); }
  retain(keys: Set<string>) { for (const key of this.values.keys()) if (!keys.has(key)) this.values.delete(key); }
  put(key: string, blob: Blob) {
    if (blob.size > this.limit) return;
    this.values.delete(key); this.values.set(key, blob);
    let bytes = [...this.values.values()].reduce((sum, b) => sum + b.size, 0);
    while (bytes > this.limit) { const first = this.values.keys().next().value!; bytes -= this.values.get(first)!.size; this.values.delete(first); }
  }
  async get(key: string, download: () => Promise<Blob>) {
    const cached = this.values.get(key);
    if (cached) { this.put(key, cached); return cached; }
    if (this.pending.has(key)) return this.pending.get(key)!;
    const epoch = this.epoch;
    const promise = download().then(blob => { if (epoch === this.epoch) this.put(key, blob); return blob; }).finally(() => { if (epoch === this.epoch) this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }
}
