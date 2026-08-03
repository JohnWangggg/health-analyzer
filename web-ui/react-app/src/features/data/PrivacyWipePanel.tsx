import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import { clearAllLocalHealthData } from '../../core/clearLocalHealth';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';

/**
 * One-tap wipe of health IDB + health localStorage (legacy privacy wipe).
 * Keeps theme / UI locale prefs.
 */
export function PrivacyWipePanel() {
  const { t } = useLocale();
  const clearSession = useHealthStore((s) => s.clear);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onWipe = useCallback(async () => {
    if (!window.confirm(t('data.privacy.confirm'))) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await clearAllLocalHealthData();
      clearSession();
      setStatus(
        t('data.privacy.ok')
          .replace('{keys}', String(r.clearedKeys.length))
          .replace('{stores}', String(r.clearedStores.length)),
      );
    } catch (e) {
      setStatus(
        `${t('data.privacy.fail')}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [clearSession, t]);

  return (
    <Card data-testid="privacy-wipe-panel">
      <CardTitle>{t('data.privacy.title')}</CardTitle>
      <CardDesc>{t('data.privacy.lead')}</CardDesc>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        data-testid="privacy-wipe"
        onClick={() => void onWipe()}
      >
        {busy ? t('data.privacy.busy') : t('data.privacy.action')}
      </Button>
      {status ? (
        <p className="muted" data-testid="privacy-wipe-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </Card>
  );
}
