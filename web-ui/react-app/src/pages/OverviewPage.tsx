import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore';
import { Button } from '../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../components/ui/EmptyState';

import fixtureXml from '../../../../e2e/fixtures/minimal-export.xml?raw';

function freshnessLabel(days: number | null): {
  text: string;
  tone: 'ok' | 'watch' | 'alert' | 'neutral';
} {
  if (days == null) return { text: '未知', tone: 'neutral' };
  if (days <= 1)
    return { text: `截至 ${days === 0 ? '今天' : '昨天'}`, tone: 'ok' };
  if (days <= 7) return { text: `${days} 天前`, tone: 'watch' };
  return { text: `${days} 天前（偏旧）`, tone: 'alert' };
}

function priorityFromSummary(summary: NonNullable<
  ReturnType<typeof useHealthStore.getState>['summary']
>): { title: string; detail: string; tone: 'ok' | 'watch' | 'alert' | 'accent' } {
  if (summary.kpis.statusLabel) {
    const tone =
      summary.kpis.statusTone === 'alert'
        ? 'alert'
        : summary.kpis.statusTone === 'watch'
          ? 'watch'
          : summary.kpis.statusTone === 'positive'
            ? 'ok'
            : 'accent';
    return {
      title: summary.kpis.statusLabel,
      detail:
        summary.kpis.recoveryScore != null
          ? `恢复分 ${summary.kpis.recoveryScore} · 负荷 ${summary.kpis.loadScore ?? '—'}`
          : '基于本机分析内核的恢复/负荷启发式（非诊断）',
      tone,
    };
  }
  if (summary.freshnessDays != null && summary.freshnessDays > 7) {
    return {
      title: '数据偏旧，建议重新导入',
      detail: `分析区间止于 ${summary.dateRange.end || '—'}`,
      tone: 'watch',
    };
  }
  if (summary.domainPresence.cgm) {
    return {
      title: '血糖域有数据，可查看趋势与报告',
      detail: `CGM ${summary.counts.cgm} 点 · 均值 ${summary.kpis.cgmMean?.toFixed(2) ?? '—'}`,
      tone: 'accent',
    };
  }
  return {
    title: '已加载本机分析',
    detail: `${summary.dateRange.start} → ${summary.dateRange.end}`,
    tone: 'ok',
  };
}

function viaLabel(via: string | null): string {
  switch (via) {
    case 'worker':
      return 'Worker 分析';
    case 'zip':
      return 'ZIP 分析';
    case 'warehouse':
      return '数据仓';
    case 'hae':
      return 'HAE 合并';
    case 'main':
      return '主线程分析';
    default:
      return '';
  }
}

export function OverviewPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const haeRef = useRef<HTMLInputElement>(null);
  const [snapMsg, setSnapMsg] = useState<string | null>(null);
  const {
    status,
    error,
    summary,
    sourceLabel,
    analyzeVia,
    lastSnapshotId,
    lastHaeNotes,
    warehousePersistMsg,
    progressLabel,
    loadXml,
    loadXmlAsync,
    loadZipFile,
    loadHaeFiles,
    loadWarehouse,
    persistWarehouse,
    saveSnapshot,
    clear,
  } = useHealthStore();

  const loadFixture = useCallback(() => {
    setSnapMsg(null);
    loadXml(fixtureXml, 'e2e/fixtures/minimal-export.xml');
  }, [loadXml]);

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setSnapMsg(null);
      const name = file.name || 'export';
      const isZip =
        /\.zip$/i.test(name) ||
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed';
      if (isZip) {
        await loadZipFile(file);
        return;
      }
      if (!/\.xml$/i.test(name) && file.type && !file.type.includes('xml')) {
        useHealthStore.setState({
          status: 'error',
          error: '请选择 export.xml / ZIP，或使用「导入 HAE」选择 JSON/CSV',
          summary: null,
          analysis: null,
          data: null,
          sourceLabel: name,
          analyzeVia: null,
        });
        return;
      }
      const text = await file.text();
      await loadXmlAsync(text, name);
    },
    [loadXmlAsync, loadZipFile],
  );

  const onPickHae = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setSnapMsg(null);
      await loadHaeFiles(Array.from(list));
    },
    [loadHaeFiles],
  );

  const onSaveSnap = useCallback(async () => {
    const id = await saveSnapshot('React 预览');
    setSnapMsg(id ? `已保存快照 ${id}` : '保存失败');
  }, [saveSnapshot]);

  if (status === 'loading') {
    return (
      <LoadingState
        label={progressLabel || '正在分析…'}
      />
    );
  }

  return (
    <div className="stack" data-testid="page-overview">
      <div>
        <h1 className="page-title">总览</h1>
        <p className="page-lead">
          XML/ZIP · HAE(JSON/CSV) · 数据仓读写（简化 core|full）。内核经
          adapter/lib。
        </p>
      </div>

      <div className="row">
        <Button
          variant="primary"
          onClick={loadFixture}
          data-testid="load-fixture"
        >
          加载演示夹具
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          data-testid="import-file-btn"
        >
          导入 XML / ZIP
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.zip,text/xml,application/xml,application/zip"
          className="sr-only"
          data-testid="import-file-input"
          onChange={(e) => {
            void onPickFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => haeRef.current?.click()}
          data-testid="import-hae-btn"
        >
          导入 HAE
        </Button>
        <input
          ref={haeRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          multiple
          className="sr-only"
          data-testid="import-hae-input"
          onChange={(e) => {
            void onPickHae(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          onClick={() => void loadWarehouse()}
          data-testid="load-warehouse"
        >
          加载数据仓
        </Button>
        <Button
          variant="secondary"
          onClick={() => void persistWarehouse()}
          disabled={!summary}
          data-testid="persist-warehouse"
        >
          写入数据仓
        </Button>
        <Button
          variant="secondary"
          onClick={() => void onSaveSnap()}
          disabled={!summary}
          data-testid="save-snapshot"
        >
          保存摘要快照
        </Button>
        <Button
          variant="secondary"
          onClick={clear}
          disabled={status === 'idle'}
          data-testid="clear-session"
        >
          清除
        </Button>
        {sourceLabel ? (
          <Badge tone="neutral" data-testid="source-label">
            来源 {sourceLabel}
          </Badge>
        ) : null}
        {analyzeVia ? (
          <Badge
            tone={
              analyzeVia === 'worker' ||
              analyzeVia === 'zip' ||
              analyzeVia === 'hae'
                ? 'ok'
                : analyzeVia === 'warehouse'
                  ? 'accent'
                  : 'watch'
            }
            data-testid="analyze-via"
          >
            {viaLabel(analyzeVia)}
          </Badge>
        ) : null}
      </div>

      {snapMsg || lastSnapshotId ? (
        <p className="muted" data-testid="snapshot-status">
          {snapMsg || `最近快照 ${lastSnapshotId}`}
        </p>
      ) : null}
      {warehousePersistMsg ? (
        <p className="muted" data-testid="warehouse-persist-status">
          {warehousePersistMsg}
        </p>
      ) : null}
      {lastHaeNotes.length ? (
        <Card data-testid="hae-notes">
          <CardTitle>HAE 合并摘要</CardTitle>
          <ul className="muted" style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
            {lastHaeNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {error ? <ErrorState message={error} /> : null}

      {!summary ? (
        <EmptyState
          testId="overview-empty"
          title="尚未加载数据"
          description="演示夹具、XML/ZIP、HAE JSON/CSV，或本地数据仓。"
          actionLabel="加载演示夹具"
          onAction={loadFixture}
        />
      ) : (
        <>
          <div className="card-grid">
            <Card data-testid="freshness-card">
              <CardTitle>数据新鲜度</CardTitle>
              {(() => {
                const f = freshnessLabel(summary.freshnessDays);
                return (
                  <>
                    <p className="kpi" data-testid="kpi-freshness">
                      {f.text}
                    </p>
                    <CardDesc>
                      区间 {summary.dateRange.start || '—'} →{' '}
                      {summary.dateRange.end || '—'}
                    </CardDesc>
                    <div style={{ marginTop: '0.5rem' }}>
                      <Badge tone={f.tone}>
                        {f.tone === 'ok' ? '较新' : '需关注'}
                      </Badge>
                    </div>
                  </>
                );
              })()}
            </Card>

            {(() => {
              const p = priorityFromSummary(summary);
              return (
                <Card className="priority-card" data-testid="priority-card">
                  <CardTitle>优先事项</CardTitle>
                  <p
                    className="kpi"
                    style={{ fontSize: '1.1rem' }}
                    data-testid="priority-title"
                  >
                    {p.title}
                  </p>
                  <CardDesc>{p.detail}</CardDesc>
                  <div style={{ marginTop: '0.5rem' }}>
                    <Badge tone={p.tone}>本机启发式</Badge>
                  </div>
                </Card>
              );
            })()}
          </div>

          <div className="card-grid">
            <Card>
              <CardTitle>日期范围</CardTitle>
              <p className="kpi" data-testid="kpi-range">
                {summary.dateRange.start || '—'} → {summary.dateRange.end || '—'}
              </p>
            </Card>
            <Card>
              <CardTitle>CGM 均值</CardTitle>
              <p className="kpi" data-testid="kpi-cgm">
                {summary.kpis.cgmMean != null
                  ? summary.kpis.cgmMean.toFixed(2)
                  : '—'}
              </p>
              <CardDesc>{summary.counts.cgm} 点</CardDesc>
            </Card>
            <Card>
              <CardTitle>最近体重</CardTitle>
              <p className="kpi" data-testid="kpi-weight">
                {summary.kpis.weightLatest != null
                  ? summary.kpis.weightLatest.toFixed(2)
                  : '—'}
              </p>
              <CardDesc>{summary.counts.weight} 条</CardDesc>
            </Card>
            <Card>
              <CardTitle>最近步数</CardTitle>
              <p className="kpi" data-testid="kpi-steps">
                {summary.kpis.stepsLatest != null
                  ? String(summary.kpis.stepsLatest)
                  : '—'}
              </p>
              <CardDesc>{summary.counts.stepsDays} 天</CardDesc>
            </Card>
            <Card>
              <CardTitle>恢复分</CardTitle>
              <p className="kpi" data-testid="kpi-recovery">
                {summary.kpis.recoveryScore != null
                  ? String(summary.kpis.recoveryScore)
                  : '—'}
              </p>
              <CardDesc>非诊断 · 个人启发式</CardDesc>
            </Card>
          </div>

          <div className="row">
            <Button variant="secondary" onClick={() => navigate('/trends')}>
              打开趋势
            </Button>
            <Button variant="secondary" onClick={() => navigate('/reports')}>
              打开报告
            </Button>
          </div>

          <Card>
            <CardTitle>域存在性</CardTitle>
            <div className="row" style={{ marginTop: '0.75rem' }}>
              {Object.entries(summary.domainPresence).map(([k, v]) => (
                <Badge
                  key={k}
                  tone={v ? 'ok' : 'neutral'}
                  data-domain={k}
                  data-present={v ? '1' : '0'}
                >
                  {k}: {v ? '有' : '无'}
                </Badge>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
