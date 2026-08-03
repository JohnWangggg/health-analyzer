import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import {
  exportAnalysisCsv,
  exportAnalysisJson,
  exportAnalysisSnapshotJson,
} from '../../core/exportActions';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';

/**
 * Download analysis JSON / CSV zip / compact snapshot (lib buildExportBundle).
 */
export function ExportPanel() {
  const { t } = useLocale();
  const analysis = useHealthStore((s) => s.analysis);
  const [status, setStatus] = useState<string | null>(null);

  const run = useCallback(
    (kind: 'json' | 'csv' | 'snapshot') => {
      if (!analysis) {
        setStatus(t('data.export.needAnalysis'));
        return;
      }
      try {
        if (kind === 'json') {
          const name = exportAnalysisJson(analysis);
          setStatus(t('data.export.okJson').replace('{name}', name));
        } else if (kind === 'csv') {
          const r = exportAnalysisCsv(analysis);
          setStatus(
            t('data.export.okCsv')
              .replace('{name}', r.filename)
              .replace('{fmt}', r.format),
          );
        } else {
          const name = exportAnalysisSnapshotJson(analysis);
          setStatus(t('data.export.okSnap').replace('{name}', name));
        }
      } catch (e) {
        setStatus(
          `${t('data.export.fail')}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [analysis, t],
  );

  return (
    <Card data-testid="export-panel">
      <CardTitle>{t('data.export.title')}</CardTitle>
      <CardDesc>{t('data.export.lead')}</CardDesc>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={!analysis}
          data-testid="export-json"
          onClick={() => run('json')}
        >
          {t('data.export.json')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!analysis}
          data-testid="export-csv"
          onClick={() => run('csv')}
        >
          {t('data.export.csv')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!analysis}
          data-testid="export-snapshot"
          onClick={() => run('snapshot')}
        >
          {t('data.export.snapshot')}
        </Button>
      </div>
      {status ? (
        <p className="muted" data-testid="export-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </Card>
  );
}
