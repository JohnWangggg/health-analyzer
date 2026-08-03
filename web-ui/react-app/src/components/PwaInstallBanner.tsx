import { useCallback, useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { useLocale } from '../i18n/LocaleProvider';

const DISMISS_KEY = 'ha-react-install-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Optional install prompt when browser fires beforeinstallprompt.
 * Dismissible; not shown in standalone / after dismiss.
 */
export function PwaInstallBanner() {
  const { t } = useLocale();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Already installed as PWA
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setHidden(true);
        return;
      }
      // iOS safari standalone
      if (
        'standalone' in navigator &&
        (navigator as { standalone?: boolean }).standalone
      ) {
        setHidden(true);
        return;
      }
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const onInstall = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
  }, [deferred]);

  const onDismiss = useCallback(() => {
    setHidden(true);
    setDeferred(null);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  if (hidden || !deferred) return null;

  return (
    <div
      className="pwa-install-banner"
      role="status"
      data-testid="pwa-install-banner"
    >
      <span>{t('shell.install.body')}</span>
      <Button
        variant="primary"
        size="sm"
        onClick={() => void onInstall()}
        data-testid="pwa-install-action"
      >
        {t('shell.install.action')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        data-testid="pwa-install-dismiss"
      >
        {t('shell.install.dismiss')}
      </Button>
    </div>
  );
}
