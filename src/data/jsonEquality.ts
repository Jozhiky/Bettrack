// PostgreSQL JSONB does not preserve object key order. Arrays remain ordered.
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item))
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
    return item;
  });
}
