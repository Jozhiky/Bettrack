import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
// Deliberate allowlist. Neither an env override nor a QA username can authorize production.
export const qaRef = 'jvydvvymhtmbczuhhrzs';
export const qaOrigin = `https://${qaRef}.supabase.co`;
export function validateConfiguration(config) {
  assert.equal(config.projectRef, qaRef, 'Only the authorized isolated QA project is allowed');
  assert.equal(config.url, qaOrigin, 'Production and arbitrary targets are forbidden');
  assert(config.publishableKey.startsWith('sb_publishable_'));
  assert.equal(config.accounts.length, 2);
  for (const account of config.accounts) {
    assert.match(account.username, /^btqa_[a-f0-9]{12}$/);
    assert.equal(account.email, `${account.username}@users.bettrack.invalid`);
    assert.match(account.id, /^[a-f0-9-]{36}$/);
  }
  return config;
}
export async function configuration() {
  return validateConfiguration(JSON.parse(await readFile('.env.qa-isolated.json', 'utf8')));
}
export function api(config) {
  assert.equal(config.url, qaOrigin);
  return createClient(qaOrigin, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        assert.equal(
          new URL(typeof input === 'string' ? input : (input.url ?? input)).origin,
          qaOrigin,
        );
        return fetch(input, init);
      },
    },
  });
}
