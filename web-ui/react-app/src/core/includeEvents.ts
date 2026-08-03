/**
 * Whether LLM / report prompts attach local health events.
 * Same semantics as legacy ctx-include-events (default OFF).
 */
export const INCLUDE_EVENTS_KEY = 'health-analyzer-include-events-ctx';

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Default false — privacy: events opt-in only. */
export function isIncludeEventsCtx(): boolean {
  return safeGet(INCLUDE_EVENTS_KEY) === '1';
}

export function setIncludeEventsCtx(on: boolean): void {
  safeSet(INCLUDE_EVENTS_KEY, on ? '1' : '0');
}
