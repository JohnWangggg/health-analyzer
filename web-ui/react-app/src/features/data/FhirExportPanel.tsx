import { useCallback, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import { exportFhirLocalArchive } from '../../core/fhirExportLocal';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';

/**
 * Experimental local-archive FHIR R4-shaped Bundle download.
 * Not hospital exchange; no network upload.
 */
export function FhirExportPanel() {
  const { t, locale } = useLocale();
  const analysis = useHealthStore((s) => s.analysis);
  const [includeDevices, setIncludeDevices] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const onExport = useCallback(() => {
    if (!analysis) {
      setStatus(t('data.fhir.needAnalysis'));
      return;
    }
    try {
      const r = exportFhirLocalArchive(analysis, {
        locale: locale === 'en' ? 'en' : 'zh-CN',
        includeDevices,
        includePatient: false,
      });
      setStatus(
        t('data.fhir.ok')
          .replace('{n}', String(r.observationCount))
          .replace('{name}', r.filename)
          .replace(
            '{val}',
            r.validationOk
              ? t('data.fhir.valOk')
              : t('data.fhir.valWarn').replace('{n}', String(r.issueCount)),
          ),
      );
    } catch (e) {
      setStatus(
        `${t('data.fhir.fail')}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, [analysis, includeDevices, locale, t]);

  return (
    <Card data-testid="fhir-export-panel">
      <div className="row" style={{ marginBottom: '0.35rem' }}>
        <CardTitle>{t('data.fhir.title')}</CardTitle>
        <Badge tone="watch">{t('data.fhir.badge')}</Badge>
      </div>
      <CardDesc>{t('data.fhir.lead')}</CardDesc>
      <label className="user-ctx-check" style={{ marginTop: '0.5rem' }}>
        <input
          type="checkbox"
          checked={includeDevices}
          onChange={(e) => setIncludeDevices(e.target.checked)}
          data-testid="fhir-include-devices"
        />
        <span>{t('data.fhir.includeDevices')}</span>
      </label>
      <div className="row" style={{ marginTop: '0.65rem' }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={!analysis}
          data-testid="fhir-export"
          onClick={onExport}
        >
          {t('data.fhir.export')}
        </Button>
      </div>
      {status ? (
        <p className="muted" data-testid="fhir-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </Card>
  );
}
