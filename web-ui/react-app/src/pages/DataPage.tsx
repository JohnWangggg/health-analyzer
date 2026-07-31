import { useCallback, useState } from 'react';
import {
  IDB_CONTRACT,
  probeIdbContract,
  type IdbProbeResult,
} from '../core/idbContract';

export function DataPage() {
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

  return (
    <div className="stack" data-testid="page-data">
      <div>
        <h1 className="page-title">数据</h1>
        <p className="page-lead">
          IndexedDB 契约与 legacy <code>history-db.js</code> 对齐：库名{' '}
          <code>{IDB_CONTRACT.name}</code>、版本{' '}
          <code>{IDB_CONTRACT.version}</code>
          。React 不强制迁移分片格式。
        </p>
      </div>

      <div className="card">
        <h2>IDB 契约</h2>
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={runProbe}
            disabled={busy}
            data-testid="probe-idb"
          >
            {busy ? '探测中…' : '探测本地仓库'}
          </button>
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
      </div>
    </div>
  );
}
