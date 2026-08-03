import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/ui/Button';
import {
  deleteLocalHealthEvent,
  listLocalHealthEvents,
  saveLocalHealthEvent,
  type HealthEvent,
  type HealthEventKind,
} from '../../core/localEvents';
import { importHaeMedicationsFile } from '../../core/haeMedsImport';
import { useLocale } from '../../i18n/LocaleProvider';

const KIND_OPTIONS: HealthEventKind[] = [
  'medication_start',
  'medication_stop',
  'illness',
  'alcohol',
  'travel',
  'late_night',
  'training_change',
  'symptom',
  'fatigue',
  'custom',
];

/**
 * Local health-events timeline (IndexedDB healthEvents — legacy-compatible).
 * Co-occurrence review only; no causal claims.
 */
export function EventsPanel() {
  const { t } = useLocale();
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [kind, setKind] = useState<HealthEventKind>('custom');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeTaken, setIncludeTaken] = useState(false);
  const medsRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (opts?: { keepStatus?: boolean }) => {
    setBusy(true);
    try {
      const rows = await listLocalHealthEvents();
      setEvents(rows.slice(0, 40));
      if (!opts?.keepStatus) setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = useCallback(async () => {
    if (!date) {
      setStatus(t('overview.events.needDate'));
      return;
    }
    setBusy(true);
    try {
      await saveLocalHealthEvent({
        kind,
        date,
        title: title.trim() || kind,
        note: note.trim() || null,
        source: 'manual',
      });
      setTitle('');
      setNote('');
      setStatus(t('overview.events.added'));
      await refresh({ keepStatus: true });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [date, kind, note, refresh, t, title]);

  const onDelete = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await deleteLocalHealthEvent(id);
        setStatus(t('overview.events.deleted'));
        await refresh({ keepStatus: true });
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
        setBusy(false);
      }
    },
    [refresh, t],
  );

  const onImportMeds = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setBusy(true);
      try {
        const r = await importHaeMedicationsFile(file, { includeTaken });
        setStatus(
          t('overview.events.medsOk')
            .replace('{n}', String(r.saved))
            .replace('{parsed}', String(r.parsed)),
        );
        await refresh({ keepStatus: true });
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [includeTaken, refresh, t],
  );

  return (
    <details
      className="overview-collapsible events-panel"
      data-testid="events-panel"
    >
      <summary>{t('overview.events.summary')}</summary>
      <div className="overview-collapsible-body">
        <p className="muted user-ctx-hint">{t('overview.events.hint')}</p>
        <div className="user-ctx-grid">
          <label className="user-ctx-field">
            <span>{t('overview.events.kind')}</span>
            <select
              value={kind}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setKind(e.target.value as HealthEventKind)
              }
              data-testid="event-kind"
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="user-ctx-field">
            <span>{t('overview.events.date')}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="event-date"
            />
          </label>
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.events.title')}</span>
            <input
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="event-title"
            />
          </label>
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.events.note')}</span>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="event-note"
            />
          </label>
        </div>
        <div className="user-ctx-actions">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            data-testid="event-add"
            onClick={() => void onAdd()}
          >
            {t('overview.events.add')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={busy}
            data-testid="event-refresh"
            onClick={() => void refresh()}
          >
            {t('overview.events.refresh')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={busy}
            data-testid="event-import-meds"
            onClick={() => medsRef.current?.click()}
          >
            {t('overview.events.importMeds')}
          </Button>
          <input
            ref={medsRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            data-testid="event-meds-input"
            onChange={(e) => {
              void onImportMeds(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <label className="user-ctx-check" style={{ marginTop: 0 }}>
            <input
              type="checkbox"
              checked={includeTaken}
              onChange={(e) => setIncludeTaken(e.target.checked)}
              data-testid="event-meds-include-taken"
            />
            <span>{t('overview.events.includeTaken')}</span>
          </label>
          {status ? (
            <span className="muted" data-testid="events-status" aria-live="polite">
              {status}
            </span>
          ) : null}
        </div>
        <ul className="events-list" data-testid="events-list">
          {events.length === 0 ? (
            <li className="muted">{t('overview.events.empty')}</li>
          ) : (
            events.map((ev) => (
              <li key={ev.id} className="events-list-item">
                <span className="events-list-meta">
                  {ev.date}
                  {ev.endDate && ev.endDate !== ev.date
                    ? ` → ${ev.endDate}`
                    : ''}{' '}
                  · {ev.kind}
                </span>
                <strong>{ev.title || ev.kind}</strong>
                {ev.note ? <span className="muted">{ev.note}</span> : null}
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  data-testid={`event-del-${ev.id}`}
                  onClick={() => void onDelete(ev.id)}
                >
                  {t('overview.events.delete')}
                </Button>
              </li>
            ))
          )}
        </ul>
      </div>
    </details>
  );
}
