import { useAuth } from './auth';
import { supabase } from '../integrations/supabase';
import { cloudStore } from '../data/cloudStore';
import { useEffect, useState, lazy, Suspense } from 'react';
import { Navigate, NavLink, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  Wallet,
  Building2,
  Radio,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Plus,
  Sun,
  Moon,
  Menu,
  X,
  Cloud,
  ArrowUpRight,
  Download,
} from 'lucide-react';
import { useApp } from './context';
import { repo } from '../data/repository';
import { Button } from '../components/ui';
const Dashboard = lazy(() => import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Bets = lazy(() => import('../pages/Bets').then((m) => ({ default: m.Bets })));
const Bank = lazy(() => import('../pages/Bank').then((m) => ({ default: m.Bank })));
const Masters = lazy(() => import('../pages/Masters').then((m) => ({ default: m.Masters })));
const Settings = lazy(() => import('../pages/Settings').then((m) => ({ default: m.Settings })));
const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/apuestas', label: 'Mis apuestas', icon: Ticket },
  { to: '/banca', label: 'Banca y movimientos', icon: Wallet },
  { to: '/casas', label: 'Casas de apuestas', icon: Building2 },
  { to: '/streamers', label: 'Streamers', icon: Radio },
  { to: '/estadisticas', label: 'Estadísticas', icon: ChartNoAxesCombined },
  { to: '/configuracion', label: 'Configuración', icon: SettingsIcon },
];
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function App() {
  const { settings, run, feedback } = useApp();
  const session = useAuth();
  const [cloudStatus, setCloudStatus] = useState(cloudStore.status);
  useEffect(() => cloudStore.subscribe(() => setCloudStatus(cloudStore.status)), []);
  const [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallEvent>();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setMenu(false);
  }, [location]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('beforeinstallprompt', prompt);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, []);
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      {menu && (
        <button
          className="mobile-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <Link to="/" className="brand">
          <div className="brand-mark">
            <ChartNoAxesCombined size={23} />
          </div>
          BETTRACK<span>®</span>
        </Link>
        <div className="workspace-label">
          ESPACIO PERSONAL<span>01</span>
        </div>
        <nav aria-label="Navegación principal">
          {links.map((l, i) => (
            <NavLink
              key={l.to}
              to={l.to}
              end
              className={({ isActive }) =>
                `${isActive ? 'active' : ''} ${i === 3 ? 'nav-divider' : ''}`
              }
            >
              <l.icon size={19} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <Cloud size={20} />
            <strong>Tu registro te acompaña.</strong>
            <p>Capturas y apuestas en tu cuenta privada.</p>
            <Link to="/configuracion">
              Gestionar mi cuenta <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="profile">
            <div>BT</div>
            <span>
              {session.user.user_metadata.username || session.user.email?.split('@')[0]}<small>Cuenta Supabase</small>
            </span>
            <button className="icon-button" aria-label="Cerrar sesión" onClick={() => void run(async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; })}>↪</button>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span>Mi espacio</span>
            <span>/</span>
            <strong>{links.find((l) => l.to === location.pathname)?.label || 'BETTRACK'}</strong>
          </div>
          <div className="top-actions">
            <span className="local-status">
              <i />
              {online ? cloudStatus : 'Sin conexión · no se guardarán cambios'}
            </span>
            <span className="currency-tag">{settings.currency}</span>
            <button
              className="icon-button"
              aria-label="Cambiar tema"
              onClick={() =>
                void run(() =>
                  repo.database.settings.put({
                    ...settings,
                    theme: settings.theme === 'light' ? 'dark' : 'light',
                  }),
                )
              }
            >
              {settings.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            {install && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await install.prompt();
                  setInstall(undefined);
                }}
              >
                <Download size={16} />
                <span className="desktop-label">Instalar</span>
              </Button>
            )}
            {location.pathname !== '/apuestas' && (
              <Button aria-label="Subir capturas" onClick={() => navigate('/apuestas')}>
                <Plus size={16} />
                <span className="desktop-label">Subir capturas</span>
              </Button>
            )}
          </div>
        </header>
        <div className="workspace-scroll">
          <main id="main">
            <Suspense
              fallback={
                <div className="loading" role="status">
                  Cargando vista…
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/apuestas" element={<Bets />} />
                <Route path="/capturas" element={<Navigate to="/apuestas" replace />} />
                <Route path="/banca" element={<Bank />} />
                <Route path="/casas" element={<Masters type="houses" />} />
                <Route path="/streamers" element={<Masters type="streamers" />} />
                <Route path="/estadisticas" element={<Dashboard statistics />} />
                <Route path="/configuracion" element={<Settings />} />
                <Route
                  path="*"
                  element={
                    <div className="empty">
                      <h1>Página no encontrada</h1>
                      <Link to="/">Volver al dashboard</Link>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
            <footer className="page-footer">
              <span>
                BETTRACK <span>·</span> Claridad para cada decisión.
              </span>
              <span>CLOUD / V0.2</span>
            </footer>
          </main>
        </div>
        {feedback && <div className="feedback-dock">{feedback}</div>}
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {links.slice(0, 3).map((l) => (
          <NavLink key={l.to} end to={l.to}>
            <l.icon size={20} />
            <span>{l.to === '/banca' ? 'Banca' : l.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setMenu(!menu)}>
          <Menu size={20} />
          <span>Más</span>
        </button>
      </nav>
    </div>
  );
}
