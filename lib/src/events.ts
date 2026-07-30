/**
 * 本机健康事件时间线（v1.41 core）
 * - 仅用于时间共现复盘，不作因果推断、不给调药建议、不诊断
 * - 手动事件优先；HAE medications 数组 best-effort 解析
 * - 本地-only，无云端
 */

import { createL, normalizeLocale } from './locale';
import { addDaysIso } from './window';

// ============================================================
// Types
// ============================================================

export type HealthEventKind =
  | 'medication_start'
  | 'medication_stop'
  | 'medication_missed'
  | 'medication_taken' // from Apple log status Taken
  | 'illness'
  | 'alcohol'
  | 'travel'
  | 'late_night'
  | 'menstrual'
  | 'training_change'
  | 'symptom'
  | 'fatigue'
  | 'custom';

export type HealthEventSource = 'manual' | 'apple_medication' | 'import';

export interface HealthEvent {
  id: string;
  kind: HealthEventKind;
  /** YYYY-MM-DD */
  date: string;
  endDate?: string | null;
  title: string;
  note?: string | null;
  /** subjective intensity 1–5 optional */
  intensity?: number | null;
  source: HealthEventSource;
  createdAt: string; // ISO
  updatedAt?: string | null;
}

export const HEALTH_EVENT_KINDS: HealthEventKind[] = [
  'medication_start',
  'medication_stop',
  'medication_missed',
  'medication_taken',
  'illness',
  'alcohol',
  'travel',
  'late_night',
  'menstrual',
  'training_change',
  'symptom',
  'fatigue',
  'custom',
];

const KIND_SET = new Set<string>(HEALTH_EVENT_KINDS);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ============================================================
// Helpers
// ============================================================

export function isHealthEventKind(s: string): s is HealthEventKind {
  return KIND_SET.has(s);
}

export function createHealthEventId(): string {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Simple stable hash → base36 id fragment (no crypto dependency). */
function stableHash(parts: string[]): string {
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Extract YYYY-MM-DD from ISO / Apple datetime / bare date. */
function toYmd(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (DATE_RE.test(s.slice(0, 10))) return s.slice(0, 10);
  const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function isValidYmd(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === s;
}

function clampIntensity(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r;
}

function isHealthEventSource(s: unknown): s is HealthEventSource {
  return s === 'manual' || s === 'apple_medication' || s === 'import';
}

function eventSpan(ev: HealthEvent): { start: string; end: string } {
  const start = ev.date;
  const end =
    ev.endDate && isValidYmd(ev.endDate) && ev.endDate >= start ? ev.endDate : start;
  return { start, end };
}

// ============================================================
// Normalize / sort / filter
// ============================================================

export function normalizeHealthEvent(
  input: Partial<HealthEvent> & { kind: string; date: string; title?: string }
): HealthEvent | null {
  if (!input || typeof input !== 'object') return null;
  const kindRaw = String(input.kind || '').trim();
  if (!isHealthEventKind(kindRaw)) return null;

  const date = toYmd(input.date);
  if (!date || !isValidYmd(date)) return null;

  let endDate: string | null = null;
  if (input.endDate != null && input.endDate !== '') {
    const ed = toYmd(input.endDate);
    if (!ed || !isValidYmd(ed)) return null;
    endDate = ed;
    if (endDate < date) return null;
  }

  const title =
    input.title != null && String(input.title).trim()
      ? String(input.title).trim()
      : kindRaw;

  const source: HealthEventSource = isHealthEventSource(input.source)
    ? input.source
    : 'manual';

  const createdAt =
    input.createdAt && String(input.createdAt).trim()
      ? String(input.createdAt).trim()
      : new Date().toISOString();

  const id =
    input.id && String(input.id).trim() ? String(input.id).trim() : createHealthEventId();

  const note =
    input.note == null || input.note === ''
      ? null
      : String(input.note);

  const intensity = clampIntensity(input.intensity);

  const updatedAt =
    input.updatedAt == null || input.updatedAt === ''
      ? null
      : String(input.updatedAt);

  return {
    id,
    kind: kindRaw,
    date,
    endDate,
    title,
    note,
    intensity,
    source,
    createdAt,
    updatedAt,
  };
}

/** date desc, then createdAt desc */
export function sortHealthEvents(events: HealthEvent[]): HealthEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ca = a.createdAt || '';
    const cb = b.createdAt || '';
    if (ca !== cb) return ca < cb ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/**
 * Events whose span overlaps [start, end] (inclusive).
 * Missing start/end → open on that side; both missing → all.
 */
export function filterEventsInRange(
  events: HealthEvent[],
  start?: string | null,
  end?: string | null
): HealthEvent[] {
  if (!events?.length) return [];
  const s = start && isValidYmd(start) ? start : null;
  const e = end && isValidYmd(end) ? end : null;
  if (!s && !e) return sortHealthEvents(events);

  const out: HealthEvent[] = [];
  for (const ev of events) {
    if (!ev?.date || !isValidYmd(ev.date)) continue;
    const span = eventSpan(ev);
    if (s && span.end < s) continue;
    if (e && span.start > e) continue;
    out.push(ev);
  }
  return sortHealthEvents(out);
}

/**
 * Events that overlap [date − radiusDays, date + radiusDays] (inclusive).
 * Default radiusDays = 3.
 */
export function eventsNearDate(
  events: HealthEvent[],
  date: string,
  radiusDays = 3
): HealthEvent[] {
  const center = toYmd(date);
  if (!center || !isValidYmd(center)) return [];
  const r = Number.isFinite(radiusDays) ? Math.max(0, Math.floor(radiusDays)) : 3;
  const start = addDaysIso(center, -r);
  const end = addDaysIso(center, r);
  return filterEventsInRange(events, start, end);
}

// ============================================================
// Labels / markdown
// ============================================================

export function formatEventKindLabel(kind: HealthEventKind, locale?: string): string {
  const L = createL(normalizeLocale(locale));
  switch (kind) {
    case 'medication_start':
      return L('开始用药', 'Medication start');
    case 'medication_stop':
      return L('停药', 'Medication stop');
    case 'medication_missed':
      return L('漏服', 'Missed dose');
    case 'medication_taken':
      return L('已服用', 'Taken');
    case 'illness':
      return L('生病/不适', 'Illness');
    case 'alcohol':
      return L('饮酒', 'Alcohol');
    case 'travel':
      return L('出行/时差', 'Travel');
    case 'late_night':
      return L('熬夜', 'Late night');
    case 'menstrual':
      return L('月经相关', 'Menstrual');
    case 'training_change':
      return L('训练变化', 'Training change');
    case 'symptom':
      return L('症状', 'Symptom');
    case 'fatigue':
      return L('疲劳', 'Fatigue');
    case 'custom':
    default:
      return L('自定义', 'Custom');
  }
}

export function formatEventsMarkdown(
  events: HealthEvent[],
  options?: { locale?: string; title?: string; max?: number }
): string {
  const locale = normalizeLocale(options?.locale);
  const L = createL(locale);
  const max =
    options?.max != null && Number.isFinite(options.max) && options.max > 0
      ? Math.floor(options.max)
      : 50;

  const heading =
    options?.title?.trim() ||
    L('## 事件时间线', '## Events timeline');

  const disclaimer = L(
    '> 仅表示时间上同时出现，**不作因果推断**，**不给出调药建议**。',
    '> Temporal co-occurrence only — **not causation**, **no medication advice**.'
  );

  const lines: string[] = [heading, '', disclaimer, ''];

  if (!events?.length) {
    lines.push(L('（暂无事件）', '(No events)'));
    lines.push('');
    return lines.join('\n');
  }

  const sorted = sortHealthEvents(events).slice(0, max);
  for (const ev of sorted) {
    const kindLabel = formatEventKindLabel(ev.kind, locale);
    const span =
      ev.endDate && ev.endDate !== ev.date ? `${ev.date} ~ ${ev.endDate}` : ev.date;
    const intensity =
      ev.intensity != null ? L(` · 强度 ${ev.intensity}/5`, ` · intensity ${ev.intensity}/5`) : '';
    const note = ev.note ? ` — ${ev.note}` : '';
    const src =
      ev.source === 'apple_medication'
        ? L('（Apple 用药日志）', ' (Apple medication log)')
        : ev.source === 'import'
          ? L('（导入）', ' (import)')
          : '';
    lines.push(`- **${span}** · ${kindLabel} · ${ev.title}${intensity}${src}${note}`);
  }

  if (events.length > max) {
    lines.push('');
    lines.push(
      L(
        `（另有 ${events.length - max} 条未列出）`,
        `(${events.length - max} more not listed)`
      )
    );
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================
// HAE medications → events
// ============================================================

interface HaeMedRow {
  displayText?: unknown;
  nickname?: unknown;
  start?: unknown;
  end?: unknown;
  scheduledDate?: unknown;
  status?: unknown;
  form?: unknown;
  dosage?: unknown;
  id?: unknown;
  [key: string]: unknown;
}

function medTitle(row: HaeMedRow): string {
  const d = row.displayText != null ? String(row.displayText).trim() : '';
  if (d) return d;
  const n = row.nickname != null ? String(row.nickname).trim() : '';
  if (n) return n;
  return 'medication';
}

function medDate(row: HaeMedRow): string | null {
  return toYmd(row.scheduledDate) || toYmd(row.start) || toYmd(row.end);
}

function medNote(row: HaeMedRow): string | null {
  const bits: string[] = [];
  if (row.dosage != null && String(row.dosage).trim()) bits.push(String(row.dosage).trim());
  if (row.form != null && String(row.form).trim()) bits.push(String(row.form).trim());
  if (row.status != null && String(row.status).trim()) bits.push(`status=${String(row.status).trim()}`);
  return bits.length ? bits.join(' · ') : null;
}

/**
 * Best-effort HAE medications → events.
 * Map:
 * - status Skipped → medication_missed
 * - status Taken → medication_taken (optional includeTaken)
 * - if start present → medication_start once per displayText+start
 * Prefer one event per med log row; stable id when no id.
 */
export function parseHaeMedicationsToEvents(
  meds: unknown[],
  options?: { includeTaken?: boolean }
): HealthEvent[] {
  if (!Array.isArray(meds) || !meds.length) return [];
  const includeTaken = !!options?.includeTaken;
  const out: HealthEvent[] = [];
  const seen = new Set<string>();
  const startedKeys = new Set<string>();
  const now = new Date().toISOString();

  for (const raw of meds) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as HaeMedRow;
    const title = medTitle(row);
    const status = row.status != null ? String(row.status).trim() : '';
    const statusLower = status.toLowerCase();
    const startYmd = toYmd(row.start);
    const date = medDate(row);
    if (!date) continue;

    // Once per displayText+start → medication_start
    if (startYmd) {
      const startKey = `${title}|${startYmd}`;
      if (!startedKeys.has(startKey)) {
        startedKeys.add(startKey);
        const startId = `ev_hae_${stableHash(['apple_medication', 'start', title, startYmd])}`;
        if (!seen.has(startId)) {
          seen.add(startId);
          const startEv = normalizeHealthEvent({
            id: startId,
            kind: 'medication_start',
            date: startYmd,
            endDate: toYmd(row.end),
            title,
            note: medNote(row),
            source: 'apple_medication',
            createdAt: now,
          });
          if (startEv) out.push(startEv);
        }
      }
    }

    let kind: HealthEventKind | null = null;
    if (statusLower === 'skipped' || statusLower === 'missed') {
      kind = 'medication_missed';
    } else if (statusLower === 'taken' || statusLower === 'completed') {
      if (includeTaken) kind = 'medication_taken';
    }

    if (!kind) continue;

    const idBase =
      row.id != null && String(row.id).trim()
        ? String(row.id).trim()
        : stableHash(['apple_medication', date, status, title, String(row.scheduledDate || row.start || '')]);
    const id = row.id != null && String(row.id).trim()
      ? `ev_${String(row.id).trim()}`
      : `ev_hae_${idBase}`;

    if (seen.has(id)) continue;
    seen.add(id);

    const ev = normalizeHealthEvent({
      id,
      kind,
      date,
      title,
      note: medNote(row),
      source: 'apple_medication',
      createdAt: now,
    });
    if (ev) out.push(ev);
  }

  return sortHealthEvents(out);
}

/** Parse from full HAE JSON text if data.medications present */
export function extractMedicationEventsFromHaeJson(
  text: string,
  options?: { includeTaken?: boolean }
): HealthEvent[] {
  if (!text || typeof text !== 'string') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const root = parsed as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;
  const meds = data.medications;
  if (!Array.isArray(meds)) return [];
  return parseHaeMedicationsToEvents(meds, options);
}
