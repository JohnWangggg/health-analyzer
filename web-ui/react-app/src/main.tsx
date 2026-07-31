import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root missing');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Self-only service worker (vite-plugin-pwa). No remote caches.
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
