import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  applyRecoveryPreset,
  loadRecoveryWeights,
  matchRecoveryPreset,
  RECOVERY_PRESET_IDS,
  type RecoveryWeightPresetId,
} from '../../core/recoveryWeights';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

const PRESET_KEYS: Record<RecoveryWeightPresetId, MessageKey> = {
  balanced: 'overview.recovery.preset.balanced',
  recoveryFirst: 'overview.recovery.preset.recoveryFirst',
  training: 'overview.recovery.preset.training',
  weightLoss: 'overview.recovery.preset.weightLoss',
};

/**
 * Recovery / load weight presets (legacy localStorage key).
 * Applying a preset reanalyzes the current session when data is loaded.
 */
export function RecoveryWeightsPanel() {
  const { t, locale } = useLocale();
  const reanalyzeSession = useHealthStore((s) => s.reanalyzeSession);
  const hasData = useHealthStore((s) => !!s.data);
  const [active, setActive] = useState<RecoveryWeightPresetId | null>(() =>
    matchRecoveryPreset(loadRecoveryWeights()),
  );
  const [status, setStatus] = useState<string | null>(null);

  const onPreset = useCallback(
    (id: RecoveryWeightPresetId) => {
      applyRecoveryPreset(id);
      setActive(id);
      if (hasData) {
        reanalyzeSession({ locale: locale === 'en' ? 'en' : 'zh-CN' });
        setStatus(t('overview.recovery.reanalyzed'));
      } else {
        setStatus(t('overview.recovery.saved'));
      }
    },
    [hasData, locale, reanalyzeSession, t],
  );

  return (
    <details
      className="overview-collapsible recovery-weights-panel"
      data-testid="recovery-weights-panel"
    >
      <summary>{t('overview.recovery.summary')}</summary>
      <div className="overview-collapsible-body">
        <p className="muted user-ctx-hint">{t('overview.recovery.hint')}</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
          {RECOVERY_PRESET_IDS.map((id) => (
            <Button
              key={id}
              variant={active === id ? 'primary' : 'ghost'}
              size="sm"
              type="button"
              data-testid={`recovery-preset-${id}`}
              onClick={() => onPreset(id)}
            >
              {t(PRESET_KEYS[id])}
            </Button>
          ))}
        </div>
        {status ? (
          <p className="muted" data-testid="recovery-status" aria-live="polite">
            {status}
          </p>
        ) : null}
      </div>
    </details>
  );
}
