/**
 * Experimental FHIR R4-shaped Bundle export (lib kernel).
 * Tiers: local-archive (default) | external-exchange (anonymous-share).
 */
import {
  buildFhirExportBundle,
  type FullAnalysis,
} from '@health-analyzer/lib';
import { dayStamp, downloadText } from './download';

export type FhirExportTierUi = 'local-archive' | 'external-exchange';

export type FhirExportUiResult = {
  filename: string;
  observationCount: number;
  validationOk: boolean;
  issueCount: number;
  exportTier: FhirExportTierUi;
  exchangeOk: boolean;
  blocked: boolean;
  json: string;
};

export function buildFhirExportUi(
  analysis: FullAnalysis,
  options?: {
    locale?: string;
    includeDevices?: boolean;
    exportTier?: FhirExportTierUi;
  },
): FhirExportUiResult {
  const exportTier = options?.exportTier || 'local-archive';
  const isExchange = exportTier === 'external-exchange';
  const result = buildFhirExportBundle(analysis, {
    locale: options?.locale ?? 'zh-CN',
    exportTier,
    includeDevices: options?.includeDevices !== false,
    includePatient: false,
    exchangePurpose: isExchange ? 'anonymous-share' : undefined,
    runExchangeValidation: isExchange,
    validate: true,
  });
  const end = analysis.dateRange?.end || dayStamp();
  const filePrefix = isExchange ? 'fhir-exchange-bundle' : 'fhir-archive-bundle';
  const filename = `${filePrefix}-${end}.json`;
  const issues = result.validation?.issues?.length ?? 0;
  const exchangeOk =
    !isExchange || result.exchangeValidation?.ok !== false;
  const blocked = isExchange && !exchangeOk;
  return {
    filename,
    observationCount: result.counts?.observations ?? 0,
    validationOk: result.validation?.ok !== false,
    issueCount: issues,
    exportTier,
    exchangeOk,
    blocked,
    json: result.json,
  };
}

export function downloadFhirExport(result: FhirExportUiResult): void {
  if (result.blocked) {
    throw new Error('exchange_gate_blocked');
  }
  downloadText(result.filename, result.json, 'application/fhir+json');
}

/** @deprecated use buildFhirExportUi + downloadFhirExport */
export function exportFhirLocalArchive(
  analysis: FullAnalysis,
  options?: {
    locale?: string;
    includeDevices?: boolean;
    includePatient?: boolean;
    patientDisplay?: string | null;
  },
): Omit<FhirExportUiResult, 'json' | 'exportTier' | 'exchangeOk' | 'blocked'> {
  const r = buildFhirExportUi(analysis, {
    locale: options?.locale,
    includeDevices: options?.includeDevices,
    exportTier: 'local-archive',
  });
  downloadFhirExport(r);
  return {
    filename: r.filename,
    observationCount: r.observationCount,
    validationOk: r.validationOk,
    issueCount: r.issueCount,
  };
}
