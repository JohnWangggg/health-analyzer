import { useCallback, useMemo, useState } from 'react';
import { useHealthStore } from '../store/useHealthStore';
import {
  buildReportPreview,
  type ReportKind,
} from '../core/HealthCoreAdapter';
import { Button } from '../components/ui/Button';
import { Card, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';

const KINDS: { id: ReportKind; label: string; fileStem: string }[] = [
  { id: 'visit', label: '门诊一页纸', fileStem: 'visit-summary' },
  { id: 'weekly', label: '周报', fileStem: 'weekly-report' },
  { id: 'clinical', label: '临床复盘', fileStem: 'clinical-review' },
];

export function ReportsPage() {
  const analysis = useHealthStore((s) => s.analysis);
  const [kind, setKind] = useState<ReportKind>('visit');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!analysis) return null;
    return buildReportPreview(analysis, kind, { locale: 'zh-CN' });
  }, [analysis, kind]);

  const copyMarkdown = useCallback(async () => {
    if (!preview?.markdown) return;
    try {
      await navigator.clipboard.writeText(preview.markdown);
      setActionMsg('已复制到剪贴板（仅本机，未上传）');
    } catch {
      setActionMsg('复制失败：请手动选择预览文本');
    }
  }, [preview]);

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
    setActionMsg(`已下载 ${a.download}`);
  }, [preview, kind, analysis]);

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
          选择类型 → 预览 Markdown → 复制或下载。内核：visit / weekly /
          clinical 生成器。
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
            onClick={() => {
              setKind(k.id);
              setActionMsg(null);
            }}
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
          <div className="row" style={{ margin: '0.75rem 0' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void copyMarkdown()}
              data-testid="report-copy"
            >
              复制 Markdown
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadMarkdown}
              data-testid="report-download"
            >
              下载 .md
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
