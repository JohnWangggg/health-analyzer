import { useEffect, useState } from 'react';
import { useLocale } from '../i18n/LocaleProvider';

/**
 * Offline banner — local-first app remains usable; no network health APIs.
 */
export function ConnectivityBanner() {
  const { t } = useLocale();
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="connectivity-banner"
      role="status"
      aria-live="polite"
      data-testid="connectivity-banner"
    >
      <span aria-hidden>📡</span>
      <span>{t('shell.offline')}</span>
    </div>
  );
}
