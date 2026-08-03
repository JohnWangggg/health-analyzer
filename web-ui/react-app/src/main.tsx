import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root missing');
}

/** Catch render crashes so users never sit on a silent white screen. */
class BootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[health-os] render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      return (
        <div
          style={{
            maxWidth: '28rem',
            margin: '12vh auto',
            padding: '1.25rem 1.5rem',
            fontFamily: 'system-ui,sans-serif',
            lineHeight: 1.5,
          }}
        >
          <h1 style={{ fontSize: '1.15rem' }}>界面启动失败</h1>
          <p style={{ opacity: 0.85 }}>{msg}</p>
          <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>
            若刚更新 GitHub Pages，请清除本站 Service Worker 缓存后重试。
          </p>
          <button
            type="button"
            onClick={() => {
              const fn = (
                window as unknown as {
                  __haClearCachesAndReload?: () => void;
                }
              ).__haClearCachesAndReload;
              if (typeof fn === 'function') fn();
              else window.location.reload();
            }}
          >
            清除缓存并重载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Deploy race: stale SW + new hashed chunks → vite preload error → auto recover once
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      event.preventDefault();
    } catch {
      /* ignore */
    }
    try {
      if (sessionStorage.getItem('ha-boot-recovered') === '1') return;
      sessionStorage.setItem('ha-boot-recovered', '1');
    } catch {
      /* ignore */
    }
    const fn = (
      window as unknown as { __haClearCachesAndReload?: () => void }
    ).__haClearCachesAndReload;
    if (typeof fn === 'function') fn();
    else window.location.reload();
  });
}

createRoot(rootEl).render(
  <StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </StrictMode>,
);

// SW registration moved to PwaUpdateBanner (prompt mode, no auto skipWaiting).
