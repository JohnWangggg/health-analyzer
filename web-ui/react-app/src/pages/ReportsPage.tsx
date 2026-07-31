import { useMemo, useState } from 'react';
import { useHealthStore } from '../store/useHealthStore';
import {
  buildReportPreview,
  type ReportKind,
} from '../core/HealthCoreAdapter';
import { Button } from '../components/ui/Button';
import { Card, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';

const KINDS: { id: ReportKind; label: string; hint: string }[] = [
  { id: 'visit', label: '门诊一页纸', hint: 'generateVisitSummaryMarkdown' },
  { id: 'weekly', label: '周报', hint: 'generateWeeklyReportMarkdown' },
  { id: 'clinical', label: '临床复盘', hint: 'generateClinicalReviewMarkdown' },
];

export function ReportsPage() {
  const analysis = useHealthStore((s) => s.analysis);
  const [kind, setKind] = useState<ReportKind>('visit');

  const preview = useMemo(() => {
    if (!analysis) return null;
    return buildReportPreview(analysis, kind, { locale: 'zh-CN' });
  }, [analysis, kind]);

  if (!analysis) {
    return (
      <div className="stack" data-testid="page-reports">
        <h1 className="page-title">报告</h1>
        <EmptyState
          title="请先在总览加载数据"
          description="报告预览通过 HealthCoreAdapter → lib 报告生成器，不在 UI 重写统计。"
        />
      </div>
    );
  }

  return (
    <div className="stack" data-testid="page-reports">
      <div>
        <h1 className="page-title">报告</h1>
        <p className="page-lead">
          选择类型 → 预览 Markdown。内核：visit / weekly / clinical 生成器。
        </p>
      </div>

      <div className="row" role="tablist" aria-label="报告类型">
        {KINDS.map((k) => (
          <Button
            key={k.id}
            variant={kind === k.id ? 'primary' : 'secondary'}
            size="sm"
            role="tab"
            aria-selected={kind === k.id}
            data-testid={`report-kind-${k.id}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </Button>
        ))}
      </div>

      {preview ? (
        <Card data-testid="report-preview-card">
          <div className="row">
            <CardTitle>{preview.title}</CardTitle>
            <Badge tone="accent">{preview.kind}</Badge>
          </div>
          <p className="muted">
            经适配器调用 lib · 字符数 {preview.markdown.length}
          </p>
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
