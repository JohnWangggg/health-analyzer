import { useCallback, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';

/**
 * Merge external weight-scale / BP CSV into the current session and reanalyze.
 */
export function CsvMergePanel() {
  const { t, locale } = useLocale();
  const mergeCsvFiles = useHealthStore((s) => s.mergeCsvFiles);
  const status = useHealthStore((s) => s.status);
  const weightRef = useRef<HTMLInputElement>(null);
  const bpRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onApply = useCallback(async () => {
    const wFile = weightRef.current?.files?.[0] ?? null;
    const bFile = bpRef.current?.files?.[0] ?? null;
    if (!wFile && !bFile) {
      setMsg(t('overview.csv.needFile'));
      return;
    }
    try {
      const weightText = wFile ? await wFile.text() : null;
      const bpText = bFile ? await bFile.text() : null;
      mergeCsvFiles(
        { weightText, bpText },
        { locale: locale === 'en' ? 'en' : 'zh-CN' },
      );
      setMsg(t('overview.csv.applied'));
      if (weightRef.current) weightRef.current.value = '';
      if (bpRef.current) bpRef.current.value = '';
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [locale, mergeCsvFiles, t]);

  return (
    <details
      className="overview-collapsible csv-merge-panel"
      data-testid="csv-merge-panel"
    >
      <summary>{t('overview.csv.summary')}</summary>
      <div className="overview-collapsible-body">
        <p className="muted user-ctx-hint">{t('overview.csv.hint')}</p>
        <div className="user-ctx-grid">
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.csv.weight')}</span>
            <input
              ref={weightRef}
              type="file"
              accept=".csv,text/csv"
              data-testid="csv-weight-input"
            />
          </label>
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.csv.bp')}</span>
            <input
              ref={bpRef}
              type="file"
              accept=".csv,text/csv"
              data-testid="csv-bp-input"
            />
          </label>
        </div>
        <div className="user-ctx-actions">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={status === 'loading'}
            data-testid="csv-apply"
            onClick={() => void onApply()}
          >
            {t('overview.csv.apply')}
          </Button>
          {msg ? (
            <span className="muted" data-testid="csv-status" aria-live="polite">
              {msg}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
