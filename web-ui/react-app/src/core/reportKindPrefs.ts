/**
 * Remember last report kind on this device (localStorage only).
 */
import type { ReportKind } from './HealthCoreAdapter';

export const REPORT_KIND_KEY = 'health-analyzer-report-kind';

const VALID: ReportKind[] = ['visit', 'weekly', 'clinical'];

export function loadReportKind(): ReportKind {
  try {
    const v = localStorage.getItem(REPORT_KIND_KEY);
    if (v && (VALID as string[]).includes(v)) return v as ReportKind;
  } catch {
    /* ignore */
  }
  return 'visit';
}

export function saveReportKind(kind: ReportKind): void {
  try {
    localStorage.setItem(REPORT_KIND_KEY, kind);
  } catch {
    /* ignore */
  }
}
