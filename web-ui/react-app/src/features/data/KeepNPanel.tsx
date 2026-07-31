import { useCallback, useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import {
  CGM_KEEP_MONTHS_OPTIONS,
  YEAR_KEEP_YEARS_OPTIONS,
  getCgmKeepMonths,
  getYearKeepYears,
  isWarehouseAutoTrimEnabled,
  setCgmKeepMonths,
  setWarehouseAutoTrimEnabled,
  setYearKeepYears,
} from '../../core/warehouseKeepPrefs';
import { forecastKeepDrops } from '../../core/warehouseKeepWindows';
import { applyKeepWindowsToStoredWarehouse } from '../../core/warehousePersist';
import type { WarehouseMetaView } from '../../core/legacyHistoryRead';
import { useLocale } from '../../i18n/LocaleProvider';

type Props = {
  meta: WarehouseMetaView | null;
  onApplied?: () => void;
};

export function KeepNPanel({ meta, onApplied }: Props) {
  const { t } = useLocale();
  const [keepMonths, setKeepMonthsState] = useState(() => getCgmKeepMonths());
  const [keepYears, setKeepYearsState] = useState(() => getYearKeepYears());
  const [autoTrim, setAutoTrimState] = useState(() =>
    isWarehouseAutoTrimEnabled(),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const forecast = useMemo(() => {
    if (!meta) return null;
    return forecastKeepDrops(
      {
        cgmMonths: meta.cgmMonths ?? undefined,
        bpYears: meta.bpYears ?? undefined,
        weightYears: meta.weightYears ?? undefined,
        sleepYears: meta.sleepYears ?? undefined,
        stepsYears: meta.stepsYears ?? undefined,
        hrvYears: meta.hrvYears ?? undefined,
        restingHrYears: meta.restingHrYears ?? undefined,
        walkingHrYears: meta.walkingHrYears ?? undefined,
        workoutsYears: meta.workoutsYears ?? undefined,
        ecgYears: meta.ecgYears ?? undefined,
        watchDailyYears: meta.watchDailyYears ?? undefined,
      },
      { keepMonths, keepYears },
    );
  }, [meta, keepMonths, keepYears]);

  const dropMonthCount = forecast?.monthDrop.length ?? 0;
  const dropYearCount = forecast
    ? Object.values(forecast.yearDrops).reduce((n, ys) => n + ys.length, 0)
    : 0;

  const onMonths = useCallback((v: number) => {
    const next = setCgmKeepMonths(v);
    setKeepMonthsState(next);
    setMsg(null);
  }, []);

  const onYears = useCallback((v: number) => {
    const next = setYearKeepYears(v);
    setKeepYearsState(next);
    setMsg(null);
  }, []);

  const onAutoTrim = useCallback((on: boolean) => {
    setAutoTrimState(setWarehouseAutoTrimEnabled(on));
    setMsg(null);
  }, []);

  const onApply = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await applyKeepWindowsToStoredWarehouse();
      if (!r.ok) {
        setMsg(
          r.reason === 'empty'
            ? t('data.keepN.empty')
            : `${t('data.keepN.fail')}: ${r.reason}`,
        );
        return;
      }
      const m = r.droppedMonthCount ?? 0;
      const y = r.droppedYearCount ?? 0;
      if (r.keepTrimmed) {
        setMsg(
          t('data.keepN.applied')
            .replace('{months}', String(m))
            .replace('{years}', String(y)),
        );
      } else {
        setMsg(t('data.keepN.noop'));
      }
      onApplied?.();
    } catch (e) {
      setMsg(
        `${t('data.keepN.fail')}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [onApplied, t]);

  return (
    <Card className="keep-n-panel" data-testid="keep-n-panel">
      <CardTitle>{t('data.keepN.title')}</CardTitle>
      <CardDesc>{t('data.keepN.lead')}</CardDesc>

      <div className="keep-n-controls">
        <label className="keep-n-field" htmlFor="keep-n-months">
          <span>{t('data.keepN.cgmMonths')}</span>
          <select
            id="keep-n-months"
            className="theme-select"
            value={keepMonths}
            data-testid="keep-n-months"
            onChange={(e) => onMonths(Number(e.target.value))}
          >
            {CGM_KEEP_MONTHS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="keep-n-field" htmlFor="keep-n-years">
          <span>{t('data.keepN.yearYears')}</span>
          <select
            id="keep-n-years"
            className="theme-select"
            value={keepYears}
            data-testid="keep-n-years"
            onChange={(e) => onYears(Number(e.target.value))}
          >
            {YEAR_KEEP_YEARS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="keep-n-field keep-n-check" htmlFor="keep-n-auto-trim">
          <input
            id="keep-n-auto-trim"
            type="checkbox"
            checked={autoTrim}
            data-testid="keep-n-auto-trim"
            onChange={(e) => onAutoTrim(e.target.checked)}
          />
          <span>{t('data.keepN.autoTrim')}</span>
        </label>
      </div>

      <p className="muted keep-n-forecast" data-testid="keep-n-forecast">
        {meta
          ? t('data.keepN.forecast')
              .replace('{months}', String(dropMonthCount))
              .replace('{years}', String(dropYearCount))
          : t('data.keepN.forecastNeedProbe')}
      </p>

      <div className="row keep-n-actions">
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          data-testid="keep-n-apply"
          onClick={() => void onApply()}
        >
          {busy ? t('data.keepN.applying') : t('data.keepN.apply')}
        </Button>
        <Badge tone="neutral">{t('data.keepN.sharedPrefs')}</Badge>
      </div>

      {msg ? (
        <p className="muted" data-testid="keep-n-status">
          {msg}
        </p>
      ) : null}
    </Card>
  );
}
