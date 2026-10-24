import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfiguration, qaRef, qaOrigin } from '../../scripts/persistence-qa/target.mjs';
const fixture = () => ({
  projectRef: qaRef,
  url: qaOrigin,
  publishableKey: 'sb_publishable_synthetic',
  accounts: [1, 2].map((n) => ({
    username: `btqa_${String(n).repeat(12)}`,
    email: `btqa_${String(n).repeat(12)}@users.bettrack.invalid`,
    id: '00000000-0000-0000-0000-000000000000',
  })),
});
test('allows only the named QA target with disposable accounts', () =>
  assert.equal(validateConfiguration(fixture()).url, qaOrigin));
test('rejects production before constructing a client', () => {
  const c = fixture();
  c.url = 'https://wfrpqzyokzrstafuqujf.supabase.co';
  assert.throws(() => validateConfiguration(c), /forbidden/);
});
test('rejects arbitrary project and real-member fixtures', () => {
  const c = fixture();
  c.projectRef = 'arbitrary-project';
  assert.throws(() => validateConfiguration(c));
  c.projectRef = qaRef;
  c.accounts[0].username = 'real-member';
  assert.throws(() => validateConfiguration(c));
});
