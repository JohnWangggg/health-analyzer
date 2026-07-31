import { useCallback, useState } from 'react';
import {
  IDB_CONTRACT,
  probeIdbContract,
  type IdbProbeResult,
} from '../core/idbContract';
import { useHealthStore } from '../store/useHealthStore';
import { Button } from '../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

function approxJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

export function DataPage() {
  const summary = useHealthStore((s) => s.summary);
  const analysis = useHealthStore((s) => s.analysis);
  const sourceLabel = useHealthStore((s) => s.sourceLabel);
  const [probe, setProbe] = useState<IdbProbeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runProbe = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await probeIdbContract();
      setProbe(result);
    } catch (e) {
      setProbe(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const memoryBytes = analysis ? approxJsonBytes(analysis) : 0;

  return (
    <div className="stack" data-testid="page-data">
      <div>
        <h1 className="page-title">数据仓</h1>
        <p className="page-lead">
          本地来源、跨度与仓库契约。Schema 与{' '}
          <code>history-db.js</code> 对齐（
          <code>
            {IDB_CONTRACT.name}@v{IDB_CONTRACT.version}
          </code>
          ），React 不强制迁移分片格式。
        </p>
      </div>

      <div className="card-grid">
        <Card data-testid="data-source-card">
          <CardTitle>数据来源</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-source">
            {sourceLabel || '尚未加载会话数据'}
          </p>
          <CardDesc>当前会话经适配器解析；未改动 IndexedDB 写入路径。</CardDesc>
        </Card>
        <Card data-testid="data-span-card">
          <CardTitle>数据跨度</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-span">
            {summary
              ? `${summary.dateRange.start || '—'} → ${summary.dateRange.end || '—'}`
              : '—'}
          </p>
          <CardDesc>
            {summary
              ? `CGM ${summary.counts.cgm} · 体重 ${summary.counts.weight} · 步数日 ${summary.counts.stepsDays}`
              : '加载夹具后显示'}
          </CardDesc>
        </Card>
        <Card data-testid="data-storage-card">
          <CardTitle>会话占用（约）</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-bytes">
            {memoryBytes ? `${(memoryBytes / 1024).toFixed(1)} KB` : '—'}
          </p>
          <CardDesc>内存中 FullAnalysis JSON 近似；非磁盘配额。</CardDesc>
        </Card>
        <Card>
          <CardTitle>备份策略</CardTitle>
          <CardDesc>
            备份/恢复仍由 legacy history-db 负责。本壳只读探测 store/index，避免分叉
            schema。
          </CardDesc>
          <div style={{ marginTop: '0.5rem' }}>
            <Badge tone="watch">备份 UI → legacy 完整实现</Badge>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>IDB 契约</CardTitle>
        <table className="table">
          <tbody>
            <tr>
              <th>DB_NAME</th>
              <td>
                <code>{IDB_CONTRACT.name}</code>
              </td>
            </tr>
            <tr>
              <th>DB_VERSION</th>
              <td>
                <code>{IDB_CONTRACT.version}</code>
              </td>
            </tr>
            <tr>
              <th>Stores</th>
              <td>
                <code>{IDB_CONTRACT.stores.join(', ')}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="row" style={{ marginTop: '1rem' }}>
          <Button
            variant="primary"
            onClick={runProbe}
            disabled={busy}
            data-testid="probe-idb"
          >
            {busy ? '探测中…' : '探测本地仓库'}
          </Button>
        </div>
        {error ? (
          <p className="status-err" role="alert">
            {error}
          </p>
        ) : null}
        {probe ? (
          <div style={{ marginTop: '1rem' }} data-testid="idb-probe-result">
            <p className={probe.ok ? 'status-ok' : 'status-err'}>
              {probe.ok ? '契约匹配' : '契约不完整'} — {probe.note}
            </p>
            <p className="muted">
              open version={probe.version}; stores=
              {probe.storeNames.join(', ') || '(none)'}
            </p>
            {probe.schemaMismatches?.length ? (
              <ul className="status-err" data-testid="idb-schema-mismatches">
                {probe.schemaMismatches.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
