import { useCallback, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import {
  downloadBackupJson,
  exportWarehouseBackup,
  importWarehouseBackup,
  type BackupEnvelope,
} from '../../core/warehouseBackup';
import { useLocale } from '../../i18n/LocaleProvider';

export type BackupPanelProps = {
  onImported?: () => void;
};

/** Surface stable error codes (decrypt_failed, invalid_backup_magic, …) for the user. */
function formatBackupError(code: string, failPrefix: string): string {
  return `${failPrefix}: ${code}`;
}

export function BackupPanel({ onImported }: BackupPanelProps) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [includeSnapshots, setIncludeSnapshots] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(false);
  const [includeReports, setIncludeReports] = useState(false);
  const [includeBatches, setIncludeBatches] = useState(false);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const onExport = useCallback(async () => {
    setBusy('export');
    setStatus(null);
    setStatusOk(false);
    try {
      const pass = passphrase.trim();
      const envelope = await exportWarehouseBackup({
        includeSnapshots,
        includeEvents,
        includeReports,
        includeBatches,
        passphrase: pass || undefined,
      });
      downloadBackupJson(envelope);
      setStatus(t('data.backup.exportOk'));
      setStatusOk(true);
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      setStatus(formatBackupError(code, t('data.backup.fail')));
      setStatusOk(false);
    } finally {
      setBusy(null);
    }
  }, [
    passphrase,
    includeSnapshots,
    includeEvents,
    includeReports,
    includeBatches,
    t,
  ]);

  const onImport = useCallback(async () => {
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setStatus(formatBackupError('no_file', t('data.backup.fail')));
      setStatusOk(false);
      return;
    }
    setBusy('import');
    setStatus(null);
    setStatusOk(false);
    try {
      const text = await file.text();
      let envelope: unknown;
      try {
        envelope = JSON.parse(text) as BackupEnvelope;
      } catch {
        throw new Error('invalid_backup_magic');
      }
      const pass = passphrase.trim();
      await importWarehouseBackup(envelope, {
        passphrase: pass || undefined,
        regrantConsent: true,
      });
      setStatus(t('data.backup.importOk'));
      setStatusOk(true);
      if (input) input.value = '';
      setSelectedName(null);
      onImported?.();
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      setStatus(formatBackupError(code, t('data.backup.fail')));
      setStatusOk(false);
    } finally {
      setBusy(null);
    }
  }, [passphrase, onImported, t]);

  const onFileChange = useCallback(() => {
    const name = fileRef.current?.files?.[0]?.name ?? null;
    setSelectedName(name);
    setStatus(null);
  }, []);

  return (
    <Card className="backup-panel" data-testid="backup-panel">
      <CardTitle>{t('data.backup.title')}</CardTitle>
      <CardDesc>{t('data.backup.lead')}</CardDesc>

      <label className="backup-field" htmlFor="backup-passphrase">
        <span>{t('data.backup.pass')}</span>
        <input
          id="backup-passphrase"
          type="password"
          className="backup-input"
          autoComplete="new-password"
          placeholder={t('data.backup.passHint')}
          value={passphrase}
          data-testid="backup-passphrase"
          disabled={busy != null}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </label>
      <p className="muted backup-pass-hint">{t('data.backup.passHint')}</p>

      <div className="backup-includes" role="group" aria-label={t('data.backup.title')}>
        <label className="backup-check" htmlFor="backup-include-snapshots">
          <input
            id="backup-include-snapshots"
            type="checkbox"
            checked={includeSnapshots}
            data-testid="backup-include-snapshots"
            disabled={busy != null}
            onChange={(e) => setIncludeSnapshots(e.target.checked)}
          />
          <span>{t('data.backup.includeSnapshots')}</span>
        </label>
        <label className="backup-check" htmlFor="backup-include-events">
          <input
            id="backup-include-events"
            type="checkbox"
            checked={includeEvents}
            data-testid="backup-include-events"
            disabled={busy != null}
            onChange={(e) => setIncludeEvents(e.target.checked)}
          />
          <span>{t('data.backup.includeEvents')}</span>
        </label>
        <label className="backup-check" htmlFor="backup-include-reports">
          <input
            id="backup-include-reports"
            type="checkbox"
            checked={includeReports}
            data-testid="backup-include-reports"
            disabled={busy != null}
            onChange={(e) => setIncludeReports(e.target.checked)}
          />
          <span>{t('data.backup.includeReports')}</span>
        </label>
        <label className="backup-check" htmlFor="backup-include-batches">
          <input
            id="backup-include-batches"
            type="checkbox"
            checked={includeBatches}
            data-testid="backup-include-batches"
            disabled={busy != null}
            onChange={(e) => setIncludeBatches(e.target.checked)}
          />
          <span>{t('data.backup.includeBatches')}</span>
        </label>
      </div>

      <div className="row backup-actions">
        <Button
          variant="primary"
          size="sm"
          disabled={busy != null}
          data-testid="backup-export"
          onClick={() => void onExport()}
        >
          {busy === 'export' ? t('data.backup.exporting') : t('data.backup.export')}
        </Button>
        <label className="backup-file-label">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            data-testid="backup-import-input"
            disabled={busy != null}
            onChange={onFileChange}
          />
          <span className="muted">
            {selectedName || '.hae-backup.json'}
          </span>
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy != null}
          data-testid="backup-import"
          onClick={() => void onImport()}
        >
          {busy === 'import' ? t('data.backup.importing') : t('data.backup.import')}
        </Button>
        <Badge tone="neutral">{t('data.backupBadge')}</Badge>
      </div>

      {status ? (
        <p
          className={statusOk ? 'status-ok' : 'status-err'}
          role={statusOk ? 'status' : 'alert'}
          data-testid="backup-status"
        >
          {status}
        </p>
      ) : null}
    </Card>
  );
}
