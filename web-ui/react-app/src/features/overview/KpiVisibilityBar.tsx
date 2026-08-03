import { useLocale } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import { Button } from '../../components/ui/Button';
import {
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
  order: KpiId[];
  onChange: (id: KpiId, visible: boolean) => void;
  onMove: (id: KpiId, dir: -1 | 1) => void;
};

export function KpiVisibilityBar({
  visibility,
  order,
  onChange,
  onMove,
}: Props) {
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
        {order.map((id, index) => (
          <div key={id} className="kpi-order-row" data-testid={`kpi-order-${id}`}>
            <label className="kpi-visibility-toggle">
              <input
                type="checkbox"
                checked={visibility[id] !== false}
                onChange={(e) => onChange(id, e.target.checked)}
                data-testid={`kpi-vis-${id}`}
              />
              <span>{t(LABEL_KEY[id])}</span>
            </label>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={index === 0}
              data-testid={`kpi-move-up-${id}`}
              aria-label={t('overview.kpiOrder.up')}
              onClick={() => onMove(id, -1)}
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={index === order.length - 1}
              data-testid={`kpi-move-down-${id}`}
              aria-label={t('overview.kpiOrder.down')}
              onClick={() => onMove(id, 1)}
            >
              ↓
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
