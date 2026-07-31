import { useCallback, useState } from 'react';
import {
  IDB_CONTRACT,
  probeIdbContract,
  type IdbProbeResult,
} from '../core/idbContract';
import {
  listSnapshotSummaries,
  readWarehouseMetaView,
  type SnapshotListItem,
  type WarehouseMetaView,
} from '../core/legacyHistoryRead';
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
  const [snapshots, setSnapshots] = useState<SnapshotListItem[] | null>(null);
  const [whMeta, setWhMeta] = useState<WarehouseMetaView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshLegacy = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [p, snaps, meta] = await Promise.all([
        probeIdbContract(),
        listSnapshotSummaries(12),
        readWarehouseMetaView(),
      ]);
      setProbe(p);
      setSnapshots(snaps);
      setWhMeta(meta);
    } catch (e) {
      setProbe(null);
      setSnapshots(null);
      setWhMeta(null);
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
          会话状态 + 共享 IDB（
          <code>
            {IDB_CONTRACT.name}@v{IDB_CONTRACT.version}
          </code>
          ）。写入在总览走 <strong>sharded-v1</strong> 整仓替换；加密备份仍在
          legacy。
        </p>
      </div>

      <div className="kpi-matrix">
        <Card data-testid="data-source-card">
          <CardTitle>会话来源</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-source">
            {sourceLabel || '尚未加载会话数据'}
          </p>
          <CardDesc>当前 React 会话（adapter 解析结果）。</CardDesc>
        </Card>
        <Card data-testid="data-span-card">
          <CardTitle>会话跨度</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-span">
            {summary
              ? `${summary.dateRange.start || '—'} → ${summary.dateRange.end || '—'}`
              : '—'}
          </p>
          <CardDesc>
            {summary
              ? `CGM ${summary.counts.cgm} · 体重 ${summary.counts.weight} · 步数日 ${summary.counts.stepsDays}`
              : '加载数据后显示'}
          </CardDesc>
        </Card>
        <Card data-testid="data-storage-card">
          <CardTitle>会话占用（约）</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-bytes">
            {memoryBytes ? `${(memoryBytes / 1024).toFixed(1)} KB` : '—'}
          </p>
          <CardDesc>内存 FullAnalysis 近似。</CardDesc>
        </Card>
        <Card>
          <CardTitle>备份</CardTitle>
          <CardDesc>加密备份/恢复 → legacy 数据中心完整实现。</CardDesc>
          <div style={{ marginTop: '0.5rem' }}>
            <Badge tone="watch">完整备份 → legacy</Badge>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>共享仓库探测</CardTitle>
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <Button
            variant="primary"
            onClick={() => void refreshLegacy()}
            disabled={busy}
            data-testid="probe-idb"
          >
            {busy ? '读取中…' : '读取本地仓库'}
          </Button>
        </div>
        {error ? (
          <p className="status-err" role="alert">
            {error}
          </p>
        ) : null}

        {probe ? (
          <div data-testid="idb-probe-result">
            <p className={probe.ok ? 'status-ok' : 'status-err'}>
              {probe.ok ? '契约匹配' : '契约不完整'} — {probe.note}
            </p>
            <p className="muted">
              version={probe.version}; stores={probe.storeNames.join(', ')}
            </p>
          </div>
        ) : null}

        {whMeta ? (
          <div style={{ marginTop: '1rem' }} data-testid="warehouse-meta-view">
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <h3 className="ui-card-title" style={{ margin: 0 }}>
                warehouseMeta
              </h3>
              {whMeta.layout ? (
                <Badge
                  tone={whMeta.layout === 'sharded-v1' ? 'ok' : 'watch'}
                  data-testid="wh-layout-badge"
                >
                  layout: {whMeta.layout}
                </Badge>
              ) : (
                <Badge tone="neutral" data-testid="wh-layout-badge">
                  layout: —
                </Badge>
              )}
            </div>
            <table className="table">
              <tbody>
                <tr>
                  <th>consent</th>
                  <td data-testid="wh-consent">
                    {whMeta.consentGranted ? '已授权' : '未授权'}
                  </td>
                </tr>
                <tr>
                  <th>跨度</th>
                  <td>
                    {whMeta.dateRange
                      ? `${whMeta.dateRange.start || '—'} → ${whMeta.dateRange.end || '—'}`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <th>约占用</th>
                  <td>
                    {whMeta.totalApproxBytes != null
                      ? `${(whMeta.totalApproxBytes / (1024 * 1024)).toFixed(2)} MB`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <th>记录数</th>
                  <td>{whMeta.totalRecordCount ?? '—'}</td>
                </tr>
                <tr>
                  <th>最近写入</th>
                  <td>{whMeta.lastWrittenAt || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}


        {snapshots ? (
          <div style={{ marginTop: '1rem' }} data-testid="snapshot-list">
            <h3 className="ui-card-title">
              摘要快照（{snapshots.length}）
            </h3>
            {snapshots.length === 0 ? (
              <p className="muted">尚无快照（可在 legacy 分析后保存）。</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>标签</th>
                    <th>savedAt</th>
                    <th>区间</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id}>
                      <td>{s.label}</td>
                      <td className="muted">{s.savedAt || '—'}</td>
                      <td className="muted">
                        {s.dateRange
                          ? `${s.dateRange.start || '—'} → ${s.dateRange.end || '—'}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
