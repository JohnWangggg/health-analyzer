import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import {
  KPI_IDS,
  type KpiId,
  type KpiVisibility,
} from './kpiVisibility';

const LABEL_KEY: Record<KpiId, MessageKey> = {
  cgm: 'overview.kpi.cgm',
  weight: 'overview.kpi.weight',
  steps: 'overview.kpi.steps',
  recovery: 'overview.kpi.recovery',
  restingHr: 'overview.kpi.restingHr',
};

type Props = {
  visibility: KpiVisibility;
  onChange: (id: KpiId, visible: boolean) => void;
};

export function KpiVisibilityBar({ visibility, onChange }: Props) {
  const { t } = useLocale();

  return (
    <div
      className="kpi-visibility-bar"
      data-testid="kpi-visibility-bar"
      role="group"
      aria-label={t('overview.kpiVisibility')}
    >
      <span className="kpi-visibility-bar-label muted">
        {t('overview.kpiVisibility')}
      </span>
      <div className="kpi-visibility-bar-toggles">
        {KPI_IDS.map((id) => (
          <label key={id} className="kpi-visibility-toggle">
            <input
              type="checkbox"
              checked={visibility[id] !== false}
              onChange={(e) => onChange(id, e.target.checked)}
              data-testid={`kpi-vis-${id}`}
            />
            <span>{t(LABEL_KEY[id])}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
