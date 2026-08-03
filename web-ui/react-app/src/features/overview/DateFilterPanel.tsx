import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  clearDateFilter,
  loadDateFilter,
  saveDateFilter,
} from '../../core/dateFilter';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';

/**
 * Optional analysis date window (sessionStorage). Reanalyzes current session.
 */
export function DateFilterPanel() {
  const { t, locale } = useLocale();
  const reanalyzeSession = useHealthStore((s) => s.reanalyzeSession);
  const hasData = useHealthStore((s) => !!(s.sourceData || s.data));
  const initial = loadDateFilter();
  const [start, setStart] = useState(initial.startDate || '');
  const [end, setEnd] = useState(initial.endDate || '');
  const [status, setStatus] = useState<string | null>(null);

  const apply = useCallback(() => {
    try {
      saveDateFilter({
        startDate: start.trim() || null,
        endDate: end.trim() || null,
      });
      if (hasData) {
        reanalyzeSession({
          locale: locale === 'en' ? 'en' : locale === 'zh-TW' ? 'zh-TW' : 'zh-CN',
          applyDateFilter: true,
        });
        setStatus(t('overview.dateFilter.applied'));
      } else {
        setStatus(t('overview.dateFilter.saved'));
      }
    } catch {
      setStatus(t('overview.dateFilter.invalid'));
    }
  }, [end, hasData, locale, reanalyzeSession, start, t]);

  const clear = useCallback(() => {
    clearDateFilter();
    setStart('');
    setEnd('');
    if (hasData) {
      reanalyzeSession({
        locale: locale === 'en' ? 'en' : locale === 'zh-TW' ? 'zh-TW' : 'zh-CN',
        applyDateFilter: false,
      });
    }
    setStatus(t('overview.dateFilter.cleared'));
  }, [hasData, locale, reanalyzeSession, t]);

  return (
    <details
      className="overview-collapsible date-filter-panel"
      data-testid="date-filter-panel"
    >
      <summary>{t('overview.dateFilter.summary')}</summary>
      <div className="overview-collapsible-body">
        <p className="muted user-ctx-hint">{t('overview.dateFilter.hint')}</p>
        <div className="user-ctx-grid">
          <label className="user-ctx-field">
            <span>{t('overview.dateFilter.start')}</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              data-testid="date-filter-start"
            />
          </label>
          <label className="user-ctx-field">
            <span>{t('overview.dateFilter.end')}</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              data-testid="date-filter-end"
            />
          </label>
        </div>
        <div className="user-ctx-actions">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            data-testid="date-filter-apply"
            onClick={apply}
          >
            {t('overview.dateFilter.apply')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            data-testid="date-filter-clear"
            onClick={clear}
          >
            {t('overview.dateFilter.clear')}
          </Button>
          {status ? (
            <span className="muted" data-testid="date-filter-status">
              {status}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
