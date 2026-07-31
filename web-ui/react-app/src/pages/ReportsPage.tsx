import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore';
import {
  buildReportPreview,
  type ReportKind,
} from '../core/HealthCoreAdapter';
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

  const preview = useMemo(() => {
    if (!analysis) return null;
    return buildReportPreview(analysis, kind, { locale });
  }, [analysis, kind, locale]);

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
    const blob = new Blob([preview.markdown], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stem}-${end}.md`;
    a.rel = 'noopener';
    a.click();
    URL.revokeObjectURL(url);
    setActionMsg(
      t('reports.downloaded').replace('{filename}', a.download),
    );
  }, [preview, kind, analysis, t]);

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
