import { afterEach, expect, it, vi } from 'vitest';
import {
  firebaseApp,
  shouldStartAnalytics,
  startFirebaseAnalytics,
} from '../integrations/firebase';

afterEach(() => vi.unstubAllEnvs());

it('initializes the requested web app without creating a remote data store', () => {
  expect(firebaseApp.options.projectId).toBe('wostcloud1');
  expect(firebaseApp.options.appId).toBe('1:950932423235:web:2a2b83a166629f9b270af6');
});

it('keeps local, staging and unrelated domains free of analytics, even in a production build', () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    'huariquecatacaos.web.app',
    'wostcloud1.web.app',
    'bettrack--preview.web.app',
  ]) {
    expect(shouldStartAnalytics(host, true, true)).toBe(false);
  }
  expect(shouldStartAnalytics('bettrack-wostcloud1.web.app', false, true)).toBe(false);
  expect(shouldStartAnalytics('bettrack-wostcloud1.web.app', true, false)).toBe(false);
  expect(shouldStartAnalytics('bettrack-wostcloud1.web.app', true, true)).toBe(true);
});

it('does not load analytics from localhost', async () => {
  const spy = vi.spyOn(document.head, 'appendChild');
  vi.stubEnv('PROD', true);
  await startFirebaseAnalytics();
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
