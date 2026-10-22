import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { usernameSchema, usernameEmail } from '../domain/identity';
import { ChartNoAxesCombined, ArrowRight, Eye, EyeOff, ShieldCheck, Cloud, ScanLine } from 'lucide-react';
import { supabase, removeLegacyData } from '../integrations/supabase';
import { cloudStore } from '../data/cloudStore';

const AuthContext = createContext<Session | null>(null);
export const useAuth = () => useContext(AuthContext)!;
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState('');
  const [recovery, setRecovery] = useState(location.hash.includes('type=recovery'));
  useEffect(() => {
    let alive = true;
    const { data } = supabase.auth.onAuthStateChange((event, value) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') { cloudStore.reset(); setRecovery(false); }
      setSession(value);
    });
    void removeLegacyData().then(async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (alive) { setSession(data.session); setReady(true); }
    }).catch(error => { if (alive) setFatal(error.message); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  if (fatal) return <div className="loading" role="alert"><h1>No se pudo preparar tu acceso</h1><p>{fatal}</p><button onClick={() => location.reload()}>Reintentar</button></div>;
  if (!ready) return <div className="loading" role="status">Preparando acceso seguro…</div>;
  if (!session || recovery) return <AuthScreen recovery={recovery} onRecovered={() => setRecovery(false)} />;
  return <AuthContext.Provider value={session}><div key={session.user.id}>{children}</div></AuthContext.Provider>;
}

export function authError(error: { message: string; code?: string }) {
  if (/invalid.*credentials/i.test(error.message)) return 'Usuario o contraseña incorrectos.';
  if (/email.*not.*confirmed/i.test(error.message)) return 'El registro requiere una configuración del administrador. Esta aplicación no utiliza confirmación por correo.';
  if (/rate|too many/i.test(error.message)) return 'Demasiados intentos. Espera unos minutos antes de volver a intentar.';
  if (/fetch|network/i.test(error.message)) return 'No hay conexión con Supabase. Comprueba tu conexión e inténtalo de nuevo.';
  if (/sending confirmation|email.*send/i.test(error.message)) return 'Supabase no pudo enviar el correo. Es necesario revisar la configuración de correo del proyecto.';
  if (/already.*registered|already.*exists/i.test(error.message)) return 'Ese usuario ya está registrado. Elige otro o inicia sesión.';
  return error.message;
}
function AuthScreen({ recovery, onRecovered }: { recovery: boolean; onRecovered: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const title = recovery ? 'Elige una nueva contraseña.' : mode === 'signup' ? 'Tu registro empieza aquí.' : 'Vuelve a tener el control.';
  const switchMode = (value: typeof mode) => { setMode(value); setError(''); setMessage(''); setPassword(''); setConfirm(''); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      if (!recovery && !usernameSchema.safeParse(username).success) throw new Error('Usa un usuario de 3 a 24 caracteres: letras, números, punto o guion, empezando por una letra.');
      if (recovery || mode === 'signup') {
        if (password.length < 10) throw new Error('Usa una contraseña de al menos 10 caracteres.');
        if (password !== confirm) throw new Error('Las contraseñas no coinciden.');
      }
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password }); if (error) throw error;
        history.replaceState(null, '', '/'); onRecovered(); return;
      }
      const redirectTo = `${location.origin}/`;
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: usernameEmail(username), password }); if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: usernameEmail(username), password, options: { emailRedirectTo: redirectTo, data: { username: usernameSchema.parse(username) } } });
        if (error) throw error;
        if (!data.session) setMessage('La cuenta requiere confirmación. Contacta al administrador para revisar la configuración del registro.');

      }
    } catch (error) { setError(authError(error as Error)); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell">
    <section className="auth-story" aria-label="BETTRACK">
      <a href="/" className="brand"><span className="brand-mark"><ChartNoAxesCombined size={23} /></span>BETTRACK<span>®</span></a>
      <div className="auth-story-content"><span className="eyebrow">CADA BOLETO, EN SU LUGAR</span><h2>Menos registro.<br />Más claridad.</h2><p>Sube tus capturas. Sigue tus apuestas.<br />Entiende qué pasa con tu banca.</p>
        <div className="auth-route"><div><ScanLine size={22} /><span>01</span><strong>Captura</strong></div><i /><div><ChartNoAxesCombined size={22} /><span>02</span><strong>Seguimiento</strong></div><i /><div><Cloud size={22} /><span>03</span><strong>Tu cuenta</strong></div></div>
      </div><p className="auth-disclaimer">Tu historial privado, disponible en tus dispositivos.<br />BETTRACK registra apuestas; no las coloca.</p>
    </section>
    <section className="auth-access">
      <div className="auth-form-wrap"><span className="eyebrow">TU ESPACIO PERSONAL</span><h1>{title}</h1><p className="auth-intro">{mode === 'signup' ? 'Crea tu cuenta para guardar tus boletos y movimientos en la nube.' : recovery ? 'Protege tu cuenta con una contraseña que no uses en otro sitio.' : 'Accede a tus apuestas, tu banca y tu historial.'}</p>
        {!recovery && <div className="auth-tabs"><button aria-pressed={mode === 'login'} onClick={() => switchMode('login')} disabled={busy}>Iniciar sesión</button><button aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')} disabled={busy}>Crear cuenta</button></div>}
        <form onSubmit={submit}>
          {!recovery && <div className="auth-field"><label htmlFor="auth-username">Usuario</label><input id="auth-username" autoComplete="username" type="text" required value={username} onChange={e => setUsername(e.target.value)} placeholder="ej. richard" autoCapitalize="none" spellCheck={false} disabled={busy} /></div>}
          <div className="auth-field"><label htmlFor="auth-password">{recovery ? 'Nueva contraseña' : 'Contraseña'}</label><div className="auth-password"><input id="auth-password" autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'} type={visible ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} minLength={mode === 'signup' || recovery ? 10 : undefined} disabled={busy} aria-describedby={recovery || mode === 'signup' ? 'auth-password-hint' : undefined} /><button type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          {(recovery || mode === 'signup') && <div className="auth-field"><label htmlFor="auth-confirm">Confirmar contraseña</label><input id="auth-confirm" autoComplete="new-password" type={visible ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} aria-describedby="auth-password-hint" /><small id="auth-password-hint">Al menos 10 caracteres.</small></div>}
          {mode === 'login' && !recovery && <p className="auth-recovery-note">¿Olvidaste tu contraseña? Contacta al administrador del grupo.</p>}
          {error && <div className="auth-notice error" role="alert">{error}</div>}{message && <div className="auth-notice" role="status">{message}</div>}
          <button className="auth-submit" disabled={busy}>{busy ? 'Conectando…' : recovery ? 'Guardar contraseña' : mode === 'signup' ? 'Crear mi cuenta' : 'Entrar a BETTRACK'}<ArrowRight size={18} /></button>
        </form><p className="auth-security"><ShieldCheck size={17} /> Acceso personal · Capturas privadas</p>
      </div><footer>BETTRACK <span>·</span> Claridad para cada decisión.</footer>
    </section>
  </main>;
}
