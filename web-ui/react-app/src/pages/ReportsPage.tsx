import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore';
import {
  buildClinicalHtml,
  buildReportPreview,
  type ReportKind,
} from '../core/HealthCoreAdapter';
import { getUserContextForPrompt } from '../core/userContext';
import { isIncludeEventsCtx } from '../core/includeEvents';
import { listLocalHealthEvents } from '../core/localEvents';
import { downloadText } from '../core/download';
import { Button } from '../components/ui/Button';
import { Card, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { useLocale } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const KINDS: { id: ReportKind; key: MessageKey; fileStem: string }[] = [
  { id: 'visit', key: 'reports.kind.visit', fileStem: 'visit-summary' },
  { id: 'weekly', key: 'reports.kind.weekly', fileStem: 'weekly-report' },
  { id: 'clinical', key: 'reports.kind.clinical', fileStem: 'clinical-review' },
];

export function ReportsPage() {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const analysis = useHealthStore((s) => s.analysis);
  const [kind, setKind] = useState<ReportKind>('visit');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [useCtx, setUseCtx] = useState(true);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [includeEvents, setIncludeEvents] = useState(() =>
    isIncludeEventsCtx(),
  );
  const [events, setEvents] = useState<unknown[]>([]);

  useEffect(() => {
    if (!includeEvents) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void listLocalHealthEvents().then((rows) => {
      if (!cancelled) setEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [includeEvents, analysis?.dateRange?.end]);

  const reportOpts = useMemo(
    () => ({
      locale: (locale === 'en' ? 'en' : 'zh-CN') as 'en' | 'zh-CN',
      userContext: useCtx ? getUserContextForPrompt() : null,
      includeSensitiveContext: includeSensitive,
      includeEvents,
      events,
    }),
    [locale, useCtx, includeSensitive, includeEvents, events],
  );

  const preview = useMemo(() => {
    if (!analysis) return null;
    return buildReportPreview(analysis, kind, reportOpts);
  }, [analysis, kind, reportOpts]);

  const copyMarkdown = useCallback(async () => {
    if (!preview?.markdown) return;
    try {
      await navigator.clipboard.writeText(preview.markdown);
      setActionMsg(t('reports.copied'));
    } catch {
      setActionMsg(t('reports.copyFail'));
    }
  }, [preview, t]);

  const downloadMarkdown = useCallback(() => {
    if (!preview?.markdown) return;
    const stem = KINDS.find((k) => k.id === kind)?.fileStem || 'report';
    const end = analysis?.dateRange?.end || 'local';
    const filename = `${stem}-${end}.md`;
    downloadText(filename, preview.markdown, 'text/markdown;charset=utf-8');
    setActionMsg(t('reports.downloaded').replace('{filename}', filename));
  }, [preview, kind, analysis, t]);

  const downloadHtml = useCallback(() => {
    if (!analysis || kind !== 'clinical') return;
    const end = analysis.dateRange?.end || 'local';
    const html = buildClinicalHtml(analysis, reportOpts);
    const filename = `clinical-review-${end}.html`;
    downloadText(filename, html, 'text/html;charset=utf-8');
    setActionMsg(t('reports.downloaded').replace('{filename}', filename));
  }, [analysis, kind, reportOpts, t]);

  if (!analysis) {
    return (
      <div className="stack" data-testid="page-reports">
        <h1 className="page-title">{t('reports.title')}</h1>
        <EmptyState
          title={t('reports.emptyTitle')}
          description={t('reports.emptyDesc')}
          actionLabel={t('reports.emptyAction')}
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  const rangeStart = analysis.dateRange?.start || '—';
  const rangeEnd = analysis.dateRange?.end || '—';

  return (
    <div className="stack" data-testid="page-reports">
      <div>
        <h1 className="page-title">{t('reports.title')}</h1>
        <p className="page-lead">{t('reports.lead')}</p>
      </div>

      <div
        className="domain-switcher"
        role="tablist"
        aria-label={t('reports.title')}
      >
        {KINDS.map((k) => (
          <Button
            key={k.id}
            variant={kind === k.id ? 'primary' : 'ghost'}
            size="sm"
            role="tab"
            aria-selected={kind === k.id}
            data-testid={`report-kind-${k.id}`}
            onClick={() => {
              setKind(k.id);
              setActionMsg(null);
            }}
          >
            {t(k.key)}
          </Button>
        ))}
      </div>

      <div className="report-options" data-testid="report-options">
        <label className="user-ctx-check">
          <input
            type="checkbox"
            checked={useCtx}
            onChange={(e) => setUseCtx(e.target.checked)}
            data-testid="report-use-ctx"
          />
          <span>{t('reports.useUserContext')}</span>
        </label>
        {(kind === 'clinical' || kind === 'weekly') && (
          <label className="user-ctx-check">
            <input
              type="checkbox"
              checked={includeEvents}
              onChange={(e) => setIncludeEvents(e.target.checked)}
              data-testid="report-include-events"
            />
            <span>{t('reports.includeEvents')}</span>
          </label>
        )}
        {kind === 'clinical' ? (
          <label className="user-ctx-check">
            <input
              type="checkbox"
              checked={includeSensitive}
              onChange={(e) => setIncludeSensitive(e.target.checked)}
              data-testid="report-include-sensitive"
            />
            <span>{t('reports.includeSensitive')}</span>
          </label>
        ) : null}
      </div>

      {preview ? (
        <Card data-testid="report-preview-card">
          <div className="row">
            <CardTitle>{preview.title}</CardTitle>
            <Badge tone="accent">{preview.kind}</Badge>
          </div>
          <p className="report-meta muted" data-testid="report-meta">
            {rangeStart} → {rangeEnd}
            {' · '}
            {t('reports.chars')} {preview.markdown.length}
            {' · '}
            {t('reports.viaAdapter')}
          </p>
          <div className="report-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void copyMarkdown()}
              data-testid="report-copy"
            >
              {t('reports.copy')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadMarkdown}
              data-testid="report-download"
            >
              {t('reports.download')}
            </Button>
            {kind === 'clinical' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadHtml}
                data-testid="report-download-html"
              >
                {t('reports.downloadHtml')}
              </Button>
            ) : null}
          </div>
          {actionMsg ? (
            <p className="muted" data-testid="report-action-status">
              {actionMsg}
            </p>
          ) : null}
          <pre
            className="report-preview"
            data-testid="report-preview"
            tabIndex={0}
          >
            {preview.markdown}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
