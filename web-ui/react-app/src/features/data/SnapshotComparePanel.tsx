import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import {
  listSnapshotSummaries,
  type SnapshotListItem,
} from '../../core/legacyHistoryRead';
import {
  diffSnapshotMetrics,
  getSnapshotDetail,
  type MetricDelta,
  type SnapshotDetail,
} from '../../core/snapshotCompare';
import { useLocale } from '../../i18n/LocaleProvider';

/**
 * Pick two saved snapshots and show numeric metric deltas (B − A).
 */
export function SnapshotComparePanel() {
  const { t } = useLocale();
  const [list, setList] = useState<SnapshotListItem[]>([]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  const [detailA, setDetailA] = useState<SnapshotDetail | null>(null);
  const [detailB, setDetailB] = useState<SnapshotDetail | null>(null);
  const [deltas, setDeltas] = useState<MetricDelta[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await listSnapshotSummaries(30);
      setList(rows);
      if (rows.length >= 2) {
        setIdA((prev) => prev || rows[1]!.id);
        setIdB((prev) => prev || rows[0]!.id);
      } else if (rows.length === 1) {
        setIdA(rows[0]!.id);
        setIdB(rows[0]!.id);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCompare = useCallback(async () => {
    if (!idA || !idB) {
      setStatus(t('data.compare.needTwo'));
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const [a, b] = await Promise.all([
        getSnapshotDetail(idA),
        getSnapshotDetail(idB),
      ]);
      if (!a || !b) {
        setStatus(t('data.compare.missing'));
        setDetailA(a);
        setDetailB(b);
        setDeltas([]);
        return;
      }
      setDetailA(a);
      setDetailB(b);
      setDeltas(diffSnapshotMetrics(a.metrics, b.metrics));
      setStatus(t('data.compare.ok').replace('{n}', String(Object.keys(a.metrics).length)));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [idA, idB, t]);

  return (
    <Card data-testid="snapshot-compare-panel">
      <CardTitle>{t('data.compare.title')}</CardTitle>
      <CardDesc>{t('data.compare.lead')}</CardDesc>
      {list.length < 2 ? (
        <p className="muted" data-testid="compare-need-snaps">
          {t('data.compare.needSnaps')}
        </p>
      ) : (
        <>
          <div className="user-ctx-grid">
            <label className="user-ctx-field">
              <span>{t('data.compare.a')}</span>
              <select
                value={idA}
                onChange={(e) => setIdA(e.target.value)}
                data-testid="compare-select-a"
              >
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.savedAt.slice(0, 16)}
                  </option>
                ))}
              </select>
            </label>
            <label className="user-ctx-field">
              <span>{t('data.compare.b')}</span>
              <select
                value={idB}
                onChange={(e) => setIdB(e.target.value)}
                data-testid="compare-select-b"
              >
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.savedAt.slice(0, 16)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: '0.65rem', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              data-testid="compare-run"
              onClick={() => void onCompare()}
            >
              {t('data.compare.run')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              data-testid="compare-refresh"
            >
              {t('data.compare.refresh')}
            </Button>
          </div>
        </>
      )}
      {status ? (
        <p className="muted" data-testid="compare-status">
          {status}
        </p>
      ) : null}
      {detailA && detailB && deltas.length > 0 ? (
        <div style={{ marginTop: '0.75rem', maxHeight: '14rem', overflow: 'auto' }}>
          <table className="table" data-testid="compare-table">
            <thead>
              <tr>
                <th>{t('data.compare.metric')}</th>
                <th>A</th>
                <th>B</th>
                <th>Δ (B−A)</th>
              </tr>
            </thead>
            <tbody>
              {deltas.slice(0, 40).map((d) => (
                <tr key={d.key}>
                  <td>{d.key}</td>
                  <td className="muted">
                    {d.a == null ? '—' : Math.round(d.a * 1000) / 1000}
                  </td>
                  <td className="muted">
                    {d.b == null ? '—' : Math.round(d.b * 1000) / 1000}
                  </td>
                  <td>
                    {d.delta == null
                      ? '—'
                      : `${d.delta > 0 ? '+' : ''}${Math.round(d.delta * 1000) / 1000}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
