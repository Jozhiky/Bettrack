import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://wfrpqzyokzrstafuqujf.supabase.co';
export const supabaseKey = 'sb_publishable_Cw2igNt5de-7OotH61NYGw_UcWbXQ3w';
// Only the authentication session lives in a cookie; application data never does.
// Chunking avoids the browser's 4 KB cookie limit. No localStorage/IndexedDB adapter.
export const cookieStorage = {
  getItem(key: string) {
    if (typeof document === 'undefined') return null;
    const values = new Map(document.cookie.split('; ').map((part) => {
      const index = part.indexOf('='); return [part.slice(0, index), part.slice(index + 1)];
    }));
    let result = '';
    for (let index = 0; values.has(`${key}.${index}`); index++) result += values.get(`${key}.${index}`);
    return result ? decodeURIComponent(result) : null;
  },
  setItem(key: string, value: string) {
    this.removeItem(key);
    const encoded = encodeURIComponent(value);
    for (let offset = 0, index = 0; offset < encoded.length; offset += 3000, index++)
      document.cookie = `${key}.${index}=${encoded.slice(offset, offset + 3000)}; Path=/; SameSite=Lax; Max-Age=604800${location.protocol === 'https:' ? '; Secure' : ''}`;
  },
  removeItem(key: string) {
    if (typeof document === 'undefined') return;
    for (const part of document.cookie.split('; ')) {
      const name = part.split('=')[0];
      if (name.startsWith(`${key}.`)) document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0${location.protocol === 'https:' ? '; Secure' : ''}`;
    }
  },
};
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: cookieStorage, storageKey: 'bt-auth', flowType: 'implicit', detectSessionInUrl: true },
});

export async function removeLegacyData() {
  // Explicitly authorized reset. Never clear another project's browser storage.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('bettrack-local-v1');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('No se pudo eliminar la base anterior de BETTRACK.'));
    request.onblocked = () => reject(new Error('Cierra las otras pestañas antiguas de BETTRACK y vuelve a intentar.'));
  });
  for (const key of Object.keys(sessionStorage)) if (/^bettrack[-:]/.test(key)) sessionStorage.removeItem(key);
  for (const key of Object.keys(localStorage)) if (/^bettrack[-:]/.test(key)) localStorage.removeItem(key);
}
