import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from './ui/Button';

/**
 * P1: prompt-based SW update — does not auto skipWaiting.
 * User confirms before reloading (protects in-flight import / report state).
 */
export function PwaUpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<
    ((reloadPage?: boolean) => Promise<void>) | null
  >(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        /* shell cached — silent */
      },
    });
    setUpdateSW(() => update);
  }, []);

  const apply = useCallback(() => {
    void updateSW?.(true);
  }, [updateSW]);

  if (!needRefresh) return null;

  return (
    <div
      className="pwa-update-banner"
      role="status"
      data-testid="pwa-update-banner"
    >
      <span>有新版本可用。建议在导入/报告结束后刷新（本机数据不受影响）。</span>
      <Button
        variant="primary"
        size="sm"
        onClick={apply}
        data-testid="pwa-update-apply"
      >
        立即刷新
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setNeedRefresh(false)}
        data-testid="pwa-update-later"
      >
        稍后
      </Button>
    </div>
  );
}
