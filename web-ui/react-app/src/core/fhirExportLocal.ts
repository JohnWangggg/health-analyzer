/**
 * Experimental local FHIR R4-shaped Bundle export (lib kernel).
 * Default tier: local-archive (personal archive, not hospital exchange).
 */
import {
  buildFhirExportBundle,
  type FullAnalysis,
} from '@health-analyzer/lib';
import { dayStamp, downloadText } from './download';

export type FhirLocalExportResult = {
  filename: string;
  observationCount: number;
  validationOk: boolean;
  issueCount: number;
};

export function exportFhirLocalArchive(
  analysis: FullAnalysis,
  options?: {
    locale?: string;
    includeDevices?: boolean;
    includePatient?: boolean;
    patientDisplay?: string | null;
  },
): FhirLocalExportResult {
  const result = buildFhirExportBundle(analysis, {
    locale: options?.locale ?? 'zh-CN',
    exportTier: 'local-archive',
    includeDevices: options?.includeDevices !== false,
    includePatient: !!options?.includePatient,
    patientDisplay: options?.patientDisplay ?? null,
    validate: true,
  });
  const end = analysis.dateRange?.end || dayStamp();
  const filename = `fhir-archive-bundle-${end}.json`;
  downloadText(filename, result.json, 'application/fhir+json');
  const issues = result.validation?.issues?.length ?? 0;
  return {
    filename,
    observationCount: result.counts?.observations ?? 0,
    validationOk: result.validation?.ok !== false,
    issueCount: issues,
  };
}
