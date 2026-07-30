/**
 * 本机导入批次可追溯 / local import provenance (v1.46)
 * - 记录导入来源文件摘要与合并统计，便于复核
 * - 本地-only JSON-friendly；非 FHIR、非医疗认证
 */

import { createL, normalizeLocale, AppLocale } from './locale';

// ============================================================
// Constants & types
// ============================================================

export const PROVENANCE_RULE_VERSION = 'health-analyzer-v1.46';

export type ImportSource = 'hae' | 'apple_zip' | 'apple_xml' | 'csv_merge' | 'other';

const IMPORT_SOURCES = new Set<string>([
  'hae',
  'apple_zip',
  'apple_xml',
  'csv_merge',
  'other',
]);

export interface ImportFileDigest {
  name: string;
  bytes: number;
  /** optional hex sha-256 prefix (first 16 chars ok) or full */
  sha256?: string | null;
}

export interface ImportBatchDomainStats {
  added?: number;
  updated?: number;
  skipped?: number;
}

export interface ImportBatchStats {
  totalAdded: number;
  totalUpdated: number;
  totalSkipped: number;
  byDomain?: Record<string, ImportBatchDomainStats>;
  unknownMetricNames?: string[];
}

export interface ImportBatchRecord {
  id: string; // batch_${timestamp}_${rand}
  createdAt: string; // ISO
  source: ImportSource;
  files: ImportFileDigest[];
  totalBytes: number;
  /** aggregate merge stats */
  stats: ImportBatchStats;
  ruleVersion: string;
  notes?: string[];
  /** cancelled mid-batch */
  cancelled?: boolean;
}

// ============================================================
// Helpers
// ============================================================

export function createImportBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isImportSource(s: unknown): s is ImportSource {
  return typeof s === 'string' && IMPORT_SOURCES.has(s);
}

function asNonNegInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function normalizeFileDigest(raw: unknown): ImportFileDigest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = o.name != null ? String(o.name).trim() : '';
  if (!name) return null;
  const bytes = asNonNegInt(o.bytes, 0);
  let sha256: string | null | undefined;
  if (o.sha256 == null || o.sha256 === '') {
    sha256 = o.sha256 === null ? null : undefined;
  } else {
    const s = String(o.sha256).trim().toLowerCase();
    sha256 = s || null;
  }
  const out: ImportFileDigest = { name, bytes };
  if (sha256 !== undefined) out.sha256 = sha256;
  return out;
}

function normalizeDomainStats(raw: unknown): ImportBatchDomainStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: ImportBatchDomainStats = {};
  if (o.added != null) out.added = asNonNegInt(o.added, 0);
  if (o.updated != null) out.updated = asNonNegInt(o.updated, 0);
  if (o.skipped != null) out.skipped = asNonNegInt(o.skipped, 0);
  return out;
}

function normalizeStats(raw: unknown): ImportBatchStats {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const stats: ImportBatchStats = {
    totalAdded: asNonNegInt(o.totalAdded, 0),
    totalUpdated: asNonNegInt(o.totalUpdated, 0),
    totalSkipped: asNonNegInt(o.totalSkipped, 0),
  };
  if (o.byDomain && typeof o.byDomain === 'object' && !Array.isArray(o.byDomain)) {
    const by: Record<string, ImportBatchDomainStats> = {};
    for (const [k, v] of Object.entries(o.byDomain as Record<string, unknown>)) {
      const d = normalizeDomainStats(v);
      if (d && k) by[k] = d;
    }
    if (Object.keys(by).length) stats.byDomain = by;
  }
  if (Array.isArray(o.unknownMetricNames)) {
    const names = o.unknownMetricNames
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 80);
    if (names.length) stats.unknownMetricNames = names;
  }
  return stats;
}

/**
 * Validate / normalize a partial import batch into a full record.
 * Returns null if id/source/createdAt cannot be recovered.
 */
export function normalizeImportBatch(
  partial: Partial<ImportBatchRecord> | Record<string, unknown> | null | undefined
): ImportBatchRecord | null {
  if (!partial || typeof partial !== 'object') return null;
  const o = partial as Record<string, unknown>;

  let id = o.id != null ? String(o.id).trim() : '';
  if (!id) id = createImportBatchId();
  if (!/^batch_[\w.-]+$/i.test(id) && !id.startsWith('batch_')) {
    // allow any non-empty id for forward-compat, but prefer batch_ prefix
    if (!id) return null;
  }

  let source: ImportSource;
  if (isImportSource(o.source)) {
    source = o.source;
  } else {
    return null;
  }

  let createdAt =
    o.createdAt != null && String(o.createdAt).trim()
      ? String(o.createdAt).trim()
      : new Date().toISOString();
  // Accept ISO-ish; reject obviously empty
  if (!createdAt) return null;
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) {
    // keep raw if not parseable but non-empty (local clock quirks)
    createdAt = new Date().toISOString();
  } else {
    createdAt = new Date(parsed).toISOString();
  }

  const filesRaw = Array.isArray(o.files) ? o.files : [];
  const files: ImportFileDigest[] = [];
  for (const f of filesRaw.slice(0, 200)) {
    const dig = normalizeFileDigest(f);
    if (dig) files.push(dig);
  }

  let totalBytes = asNonNegInt(o.totalBytes, -1);
  if (totalBytes < 0) {
    totalBytes = files.reduce((s, f) => s + (f.bytes || 0), 0);
  }

  const stats = normalizeStats(o.stats);

  const ruleVersion =
    o.ruleVersion != null && String(o.ruleVersion).trim()
      ? String(o.ruleVersion).trim()
      : PROVENANCE_RULE_VERSION;

  const notes = Array.isArray(o.notes)
    ? o.notes.map((n) => String(n ?? '').trim()).filter(Boolean).slice(0, 40)
    : undefined;

  const record: ImportBatchRecord = {
    id,
    createdAt,
    source,
    files,
    totalBytes,
    stats,
    ruleVersion,
  };
  if (notes && notes.length) record.notes = notes;
  if (o.cancelled === true) record.cancelled = true;
  return record;
}

function sourceLabel(source: ImportSource, locale: AppLocale): string {
  const L = createL(locale);
  switch (source) {
    case 'hae':
      return L('Health Auto Export (HAE)', 'Health Auto Export (HAE)');
    case 'apple_zip':
      return L('Apple Health ZIP', 'Apple Health ZIP');
    case 'apple_xml':
      return L('Apple Health XML', 'Apple Health XML');
    case 'csv_merge':
      return L('外部 CSV 合并', 'External CSV merge');
    default:
      return L('其他', 'Other');
  }
}

function shortId(id: string): string {
  if (!id) return '—';
  // batch_1710000000000_abc1234 → keep tail-ish readable form
  const m = id.match(/^batch_(\d{6,})_(.+)$/);
  if (m) return `${m[1].slice(-6)}_${m[2].slice(0, 6)}`;
  return id.length > 18 ? id.slice(0, 18) : id;
}

/**
 * Markdown appendix for clinical / weekly reports.
 * Disclaimer: 本附录记录本机导入与程序处理上下文，便于复核；非医疗认证。
 */
export function formatProvenanceAppendixMarkdown(
  batches: ImportBatchRecord[] | null | undefined,
  options?: { locale?: string; max?: number }
): string {
  const locale = normalizeLocale(options?.locale);
  const L = createL(locale);
  const max = Math.max(1, Math.min(options?.max ?? 10, 50));
  const list = (Array.isArray(batches) ? batches : [])
    .map((b) => normalizeImportBatch(b))
    .filter((b): b is ImportBatchRecord => !!b)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, max);

  const lines: string[] = [];
  lines.push(L('## 数据可追溯 · 导入批次', '## Data provenance · Import batches'));
  lines.push('');
  lines.push(
    L(
      '> **本附录记录本机导入与程序处理上下文，便于复核；非医疗认证。** 数据未上传本工具服务器；非 FHIR。',
      '> **This appendix records local import and processing context for review; not a medical certification.** Data is not uploaded to this tool’s servers; not FHIR.'
    )
  );
  lines.push('');

  if (!list.length) {
    lines.push(L('（暂无本机导入批次记录）', '(No local import batch records)'));
    lines.push('');
    return lines.join('\n');
  }

  lines.push(
    L(
      `共展示最近 **${list.length}** 条导入批次（本机 IndexedDB）。`,
      `Showing the latest **${list.length}** import batch(es) (local IndexedDB).`
    )
  );
  lines.push('');

  list.forEach((b, i) => {
    const n = i + 1;
    const cancelled = b.cancelled
      ? L(' · **已取消**', ' · **cancelled**')
      : '';
    lines.push(
      L(
        `### 批次 ${n} · \`${shortId(b.id)}\`${cancelled}`,
        `### Batch ${n} · \`${shortId(b.id)}\`${cancelled}`
      )
    );
    lines.push('');
    lines.push(
      L(
        `- **来源**：${sourceLabel(b.source, locale)} (\`${b.source}\`)`,
        `- **Source**: ${sourceLabel(b.source, locale)} (\`${b.source}\`)`
      )
    );
    lines.push(
      L(
        `- **时间**：${b.createdAt}`,
        `- **When**: ${b.createdAt}`
      )
    );
    lines.push(
      L(
        `- **规则版本**：\`${b.ruleVersion || PROVENANCE_RULE_VERSION}\``,
        `- **Rule version**: \`${b.ruleVersion || PROVENANCE_RULE_VERSION}\``
      )
    );
    lines.push(
      L(
        `- **合并统计**：新增 ${b.stats.totalAdded} · 更新 ${b.stats.totalUpdated} · 跳过 ${b.stats.totalSkipped}`,
        `- **Merge stats**: added ${b.stats.totalAdded} · updated ${b.stats.totalUpdated} · skipped ${b.stats.totalSkipped}`
      )
    );

    if (b.files?.length) {
      const totalB =
        b.totalBytes > 0
          ? b.totalBytes
          : b.files.reduce((s, f) => s + (f.bytes || 0), 0);
      lines.push(
        L(
          `- **文件**（${b.files.length}，约 ${totalB} bytes）：`,
          `- **Files** (${b.files.length}, ~${totalB} bytes):`
        )
      );
      for (const f of b.files.slice(0, 20)) {
        const hash =
          f.sha256 != null && String(f.sha256)
            ? ` · sha256=${String(f.sha256).slice(0, 16)}${String(f.sha256).length > 16 ? '…' : ''}`
            : '';
        lines.push(`  - \`${f.name}\` (${f.bytes || 0} B${hash})`);
      }
      if (b.files.length > 20) {
        lines.push(
          L(
            `  - … 另有 ${b.files.length - 20} 个文件`,
            `  - … and ${b.files.length - 20} more file(s)`
          )
        );
      }
    } else {
      lines.push(L('- **文件**：（无）', '- **Files**: (none)'));
    }

    if (b.stats.byDomain && Object.keys(b.stats.byDomain).length) {
      const bits = Object.entries(b.stats.byDomain)
        .slice(0, 24)
        .map(([domain, d]) => {
          const a = d?.added ?? 0;
          const u = d?.updated ?? 0;
          const s = d?.skipped ?? 0;
          return `${domain} +${a}/~${u}/−${s}`;
        });
      lines.push(
        L(`- **分域**：${bits.join(' · ')}`, `- **By domain**: ${bits.join(' · ')}`)
      );
    }

    if (b.stats.unknownMetricNames?.length) {
      const names = b.stats.unknownMetricNames.slice(0, 12).join(', ');
      const more =
        b.stats.unknownMetricNames.length > 12
          ? L(
              ` 等 ${b.stats.unknownMetricNames.length} 项`,
              ` (+${b.stats.unknownMetricNames.length - 12} more)`
            )
          : '';
      lines.push(
        L(
          `- **未知指标名**：${names}${more}`,
          `- **Unknown metrics**: ${names}${more}`
        )
      );
    }

    if (b.notes?.length) {
      lines.push(L('- **备注**：', '- **Notes**:'));
      for (const note of b.notes.slice(0, 12)) {
        lines.push(`  - ${note}`);
      }
    }

    lines.push('');
  });

  lines.push(
    L(
      '*数据可追溯附录结束。仅反映本机导入与处理上下文。*',
      '*End of provenance appendix. Reflects local import/processing context only.*'
    )
  );
  lines.push('');

  return lines.join('\n');
}
