import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { Provider } from './app/context';
import './styles.css';
import './visual-system.css';
import { AuthGate } from './app/auth';
const updateSW = registerSW({
  onNeedRefresh() {
    if (
      confirm(
        'Hay una nueva versión de BETTRACK. ¿Actualizar ahora? Guarda primero cualquier formulario abierto.',
      )
    )
      void updateSW(true);
  },
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthGate><Provider>
        <App />
      </Provider></AuthGate>
    </BrowserRouter>
  </React.StrictMode>,
);
