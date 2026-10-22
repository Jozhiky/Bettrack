import { getApp, getApps, initializeApp } from 'firebase/app';

// Public web-app identifiers, verified against the Firebase CLI SDK config.
// These do not grant access to a database or to users' local captures.
export const firebaseConfig = {
  apiKey: 'AIzaSyAWXzpuXdIxAc5H-1u5ME7fw6r2DNa23Qk',
  authDomain: 'wostcloud1.firebaseapp.com',
  projectId: 'wostcloud1',
  storageBucket: 'wostcloud1.firebasestorage.app',
  messagingSenderId: '950932423235',
  appId: '1:950932423235:web:2a2b83a166629f9b270af6',
  measurementId: 'G-KSSVEQBRYB',
};

export const firebaseApp = getApps().some((app) => app.name === 'bettrack')
  ? getApp('bettrack')
  : initializeApp(firebaseConfig, 'bettrack');

export function shouldStartAnalytics(hostname: string, production: boolean, enabled: boolean) {
  // Keep localhost, test servers and temporary preview channels fully local.
  return (
    production &&
    enabled &&
    ['bettrack-wostcloud1.web.app', 'bettrack-wostcloud1.firebaseapp.com'].includes(hostname)
  );
}

export async function startFirebaseAnalytics() {
  if (
    !shouldStartAnalytics(
      location.hostname,
      import.meta.env.PROD,
      import.meta.env.VITE_FIREBASE_ANALYTICS !== 'false',
    )
  )
    return;
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) getAnalytics(firebaseApp);
  } catch {
    // Tracking must never interrupt local storage, navigation, or offline OCR.
    console.info('Analytics no está disponible; BETTRACK continúa en modo local.');
  }
}
