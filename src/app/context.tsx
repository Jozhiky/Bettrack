import { useAuth } from './auth';
import { cloudStore } from '../data/cloudStore';
import { supabase } from '../integrations/supabase';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useLiveQuery } from '../data/useCloudQuery';
import { repo } from '../data/repository';
import { startCaptureQueue } from '../data/captures';
import { defaultSettings, type Snapshot, type Settings } from '../domain/model';
const Context = createContext<{
  data: Snapshot;
  settings: Settings;
  feedback: ReactNode;
  modalError: ReactNode;
  notify: (s: string, error?: boolean) => void;
  run: (
    action: () => Promise<unknown>,
    success?: string,
    undo?: () => Promise<unknown>,
  ) => Promise<boolean>;
} | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const session = useAuth();
  const [ready, setReady] = useState(false),
    [fatal, setFatal] = useState(''),
    [toast, setToast] = useState<{
      text: string;
      error: boolean;
      undo?: () => Promise<unknown>;
    } | null>(null),
    [undoing, setUndoing] = useState(false);
  useEffect(() => {
    let disposed = false;
    void cloudStore.connect(session.user.id).then(async () => {
      if (disposed) return;
      await repo.init();
      if (!disposed) setReady(true);
    }).catch(error => { if (!disposed) setFatal(error.message); });
    return () => { disposed = true; cloudStore.reset(); };
  }, [session.user.id]);
  const data = useLiveQuery(() => repo.snapshot(), []);
  useEffect(() => {
    if (ready) return startCaptureQueue();
  }, [ready]);
  const settings =
    useLiveQuery(() => repo.database.settings.get('settings'), []) ?? defaultSettings;
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(() => {
    if (toast && !toast.error) {
      const t = setTimeout(() => setToast(null), toast.undo ? 15000 : 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const notify = (text: string, error = false) => setToast({ text, error });
  const run = async (
    action: () => Promise<unknown>,
    success = 'Guardado en Supabase',
    undo?: () => Promise<unknown>,
  ) => {
    try {
      await action();
      setToast({ text: success, error: false, undo });
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
      return false;
    }
  };
  if (fatal)
    return (
      <div className="empty">
        <h1>No se pudo conectar a tu cuenta</h1>
        <p>{fatal}</p><button onClick={() => location.reload()}>Reintentar</button><button onClick={() => void supabase.auth.signOut()}>Cerrar sesión</button>
        <p>Comprueba tu conexión e inténtalo de nuevo.</p>
      </div>
    );
  if (!ready || !data)
    return (
      <div className="loading" role="status">
        Cargando tu espacio en Supabase…
        <div className="skeleton" />
      </div>
    );
  const feedback = toast ? (
    <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
      {toast.text}
      {toast.undo && (
        <button
          disabled={undoing}
          onClick={async () => {
            setUndoing(true);
            await run(toast.undo!, 'Resultado deshecho. La apuesta vuelve a estar abierta.');
            setUndoing(false);
          }}
        >
          Deshacer
        </button>
      )}
      <button aria-label="Cerrar aviso" onClick={() => setToast(null)}>
        ×
      </button>
    </div>
  ) : null;
  return (
    <Context.Provider
      value={{ data, settings, notify, run, feedback, modalError: toast?.error ? feedback : null }}
    >
      {children}
    </Context.Provider>
  );
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('Falta Provider');
  return value;
}
export function useModalError() {
  return useContext(Context)?.modalError;
}
