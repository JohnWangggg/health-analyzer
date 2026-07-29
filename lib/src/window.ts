/**
 * 统一日历窗口工具
 *
 * 语义约定：「近 N 日」= 以 end 为末日的最近 N 个自然日（含 end，共 N 天）。
 * 例：end=2026-07-08, days=7 → start=2026-07-02（7/2…7/8 共 7 天），不是 end−7（那会变成 8 天）。
 */

/** 将 YYYY-MM-DD 加减整数天（UTC 日历，避免本地 TZ 漂移） */
export function addDaysIso(date: string, deltaDays: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return date;
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** 两日期间隔天数（b − a）；非法日期返回 0 */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / (24 * 3600 * 1000));
}

/**
 * 以 endDate 为末日的最近 `days` 个自然日（含 end，共 days 天）。
 * days≤0 时退化为 { start: end, end }。
 */
export function calendarWindowEndInclusive(
  endDate: string,
  days: number
): { start: string; end: string } {
  const end = endDate;
  const n = Math.floor(days);
  if (!end || !Number.isFinite(n) || n <= 0) {
    return { start: end, end };
  }
  return { start: addDaysIso(end, -(n - 1)), end };
}

/** date 是否落在闭区间 [start, end] */
export function inCalendarWindow(date: string, start: string, end: string): boolean {
  return !!date && date >= start && date <= end;
}

/**
 * 统计落在 [start, end] 内、有数据的不重复自然日数。
 * dates 可为任意可迭代的 YYYY-MM-DD。
 */
export function countDaysWithData(
  dates: Iterable<string>,
  start: string,
  end: string
): number {
  const seen = new Set<string>();
  for (const d of dates) {
    if (d && d >= start && d <= end) seen.add(d);
  }
  return seen.size;
}

/** 从 date→value 映射中取窗口内有限值 */
export function valuesInCalendarWindow(
  map: Record<string, number> | null | undefined,
  start: string,
  end: string
): { values: number[]; dates: string[] } {
  if (!map) return { values: [], dates: [] };
  const dates: string[] = [];
  const values: number[] = [];
  for (const d of Object.keys(map).sort()) {
    if (d < start || d > end) continue;
    const v = map[d];
    if (v != null && Number.isFinite(v)) {
      dates.push(d);
      values.push(v);
    }
  }
  return { values, dates };
}

/** 窗口内日均值；无数据返回 null */
export function meanInCalendarWindow(
  map: Record<string, number> | null | undefined,
  endDate: string,
  days: number
): { mean: number | null; daysWithData: number; start: string; end: string } {
  const { start, end } = calendarWindowEndInclusive(endDate, days);
  const { values } = valuesInCalendarWindow(map, start, end);
  if (!values.length) {
    return { mean: null, daysWithData: 0, start, end };
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean, daysWithData: values.length, start, end };
}

/**
 * 取 end 窗口之前的历史值（date < windowStart），按日期升序。
 * 可选 maxDays：只保留最靠近窗口的至多 maxDays 个有数据日。
 */
export function priorValuesBeforeWindow(
  map: Record<string, number> | null | undefined,
  windowStart: string,
  maxDays?: number
): number[] {
  if (!map) return [];
  const keys = Object.keys(map)
    .filter((d) => d < windowStart)
    .sort();
  const limited =
    maxDays != null && maxDays > 0 ? keys.slice(-Math.floor(maxDays)) : keys;
  return limited.map((d) => map[d]).filter((v): v is number => v != null && Number.isFinite(v));
}

/** 记录数组按 date 字段滤入日历窗口 */
export function filterByCalendarWindow<T extends { date: string }>(
  records: T[],
  endDate: string,
  days: number
): { items: T[]; start: string; end: string; daysWithData: number } {
  const { start, end } = calendarWindowEndInclusive(endDate, days);
  const items = records.filter((r) => r.date >= start && r.date <= end);
  const daysWithData = countDaysWithData(
    items.map((r) => r.date),
    start,
    end
  );
  return { items, start, end, daysWithData };
}
