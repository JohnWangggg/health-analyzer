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
import { BackupPanel } from '../features/data/BackupPanel';
import { ExportPanel } from '../features/data/ExportPanel';
import { FhirExportPanel } from '../features/data/FhirExportPanel';
import { PrivacyWipePanel } from '../features/data/PrivacyWipePanel';
import { SnapshotComparePanel } from '../features/data/SnapshotComparePanel';
import { SoftQuotaPanel } from '../features/data/SoftQuotaPanel';
import { KeepNPanel } from '../features/data/KeepNPanel';
import { ShardCleanupPanel } from '../features/data/ShardCleanupPanel';
import { useHealthStore } from '../store/useHealthStore';
import { Button } from '../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useLocale } from '../i18n/LocaleProvider';

function approxJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

export function DataPage() {
  const { t } = useLocale();
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
        <h1 className="page-title">{t('data.title')}</h1>
        <p className="page-lead">
          {t('data.leadPrefix')}
          <code>
            {IDB_CONTRACT.name}@v{IDB_CONTRACT.version}
          </code>
          {t('data.leadSuffix')}
        </p>
      </div>

      <div className="kpi-matrix">
        <Card data-testid="data-source-card">
          <CardTitle>{t('data.source')}</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-source">
            {sourceLabel || t('data.sourceEmpty')}
          </p>
          <CardDesc>{t('data.sourceDesc')}</CardDesc>
        </Card>
        <Card data-testid="data-span-card">
          <CardTitle>{t('data.span')}</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-span">
            {summary
              ? `${summary.dateRange.start || '—'} → ${summary.dateRange.end || '—'}`
              : '—'}
          </p>
          <CardDesc>
            {summary
              ? t('data.spanCounts')
                  .replace('{cgm}', String(summary.counts.cgm))
                  .replace('{weight}', String(summary.counts.weight))
                  .replace('{stepsDays}', String(summary.counts.stepsDays))
              : t('data.spanEmpty')}
          </CardDesc>
        </Card>
        <Card data-testid="data-storage-card">
          <CardTitle>{t('data.bytes')}</CardTitle>
          <p className="kpi" style={{ fontSize: '1rem' }} data-testid="data-bytes">
            {memoryBytes ? `${(memoryBytes / 1024).toFixed(1)} KB` : '—'}
          </p>
          <CardDesc>{t('data.bytesDesc')}</CardDesc>
        </Card>
      </div>

      <ExportPanel />

      <FhirExportPanel />

      <PrivacyWipePanel />

      <SnapshotComparePanel />

      <BackupPanel onImported={() => void refreshLegacy()} />

      <SoftQuotaPanel
        layout={whMeta?.layout}
        totalApproxBytes={whMeta?.totalApproxBytes}
        lastWrittenAt={whMeta?.lastWrittenAt}
      />

      <KeepNPanel meta={whMeta} onApplied={() => void refreshLegacy()} />

      <ShardCleanupPanel onChanged={() => void refreshLegacy()} />

      <Card>
        <CardTitle>{t('data.probe')}</CardTitle>
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <Button
            variant="primary"
            onClick={() => void refreshLegacy()}
            disabled={busy}
            data-testid="probe-idb"
          >
            {busy ? t('data.probeBusy') : t('data.probeAction')}
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
              {probe.ok ? t('data.contractOk') : t('data.contractFail')} —{' '}
              {probe.note}
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
                  <th>{t('data.meta.consent')}</th>
                  <td data-testid="wh-consent">
                    {whMeta.consentGranted
                      ? t('data.consentGranted')
                      : t('data.consentDenied')}
                  </td>
                </tr>
                <tr>
                  <th>{t('data.meta.span')}</th>
                  <td>
                    {whMeta.dateRange
                      ? `${whMeta.dateRange.start || '—'} → ${whMeta.dateRange.end || '—'}`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <th>{t('data.meta.approx')}</th>
                  <td>
                    {whMeta.totalApproxBytes != null
                      ? `${(whMeta.totalApproxBytes / (1024 * 1024)).toFixed(2)} MB`
                      : '—'}
                  </td>
                </tr>
                <tr>
                  <th>{t('data.meta.records')}</th>
                  <td>{whMeta.totalRecordCount ?? '—'}</td>
                </tr>
                <tr>
                  <th>{t('data.meta.lastWritten')}</th>
                  <td>{whMeta.lastWrittenAt || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {snapshots ? (
          <div style={{ marginTop: '1rem' }} data-testid="snapshot-list">
            <h3 className="ui-card-title">
              {t('data.snapshots').replace(
                '{count}',
                String(snapshots.length),
              )}
            </h3>
            {snapshots.length === 0 ? (
              <p className="muted">{t('data.snapshotsEmpty')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('data.snapLabel')}</th>
                    <th>{t('data.snapSavedAt')}</th>
                    <th>{t('data.snapRange')}</th>
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
