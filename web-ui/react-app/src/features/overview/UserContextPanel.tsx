import { useCallback, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/ui/Button';
import {
  clearUserContext,
  isIncludeSensitiveCtx,
  loadUserContext,
  saveUserContext,
  setIncludeSensitiveCtx,
  type UserContext,
} from '../../core/userContext';
import { useLocale } from '../../i18n/LocaleProvider';

function toInputString(v: number | string | null | undefined): string {
  if (v == null || v === '') return '';
  return String(v);
}

function parseOptionalNumber(raw: string): number | null {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Optional personal background form.
 * Persists to the same localStorage keys as legacy app.js (Strategy A).
 */
export function UserContextPanel() {
  const { t } = useLocale();
  const [form, setForm] = useState<UserContext>(() => loadUserContext());
  const [includeSensitive, setIncludeSensitive] = useState(() =>
    isIncludeSensitiveCtx(),
  );
  const [status, setStatus] = useState<string | null>(null);

  const onNum =
    (key: 'age' | 'heightCm' | 'targetWeightKg') =>
    (e: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({
        ...prev,
        [key]: parseOptionalNumber(e.target.value),
      }));
      setStatus(null);
    };

  const onText =
    (key: 'sex' | 'medications' | 'conditions' | 'focus' | 'notes') =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      setForm((prev) => ({
        ...prev,
        [key]: v.trim() === '' ? null : v,
      }));
      setStatus(null);
    };

  const onIncludeSensitive = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const on = e.target.checked;
      setIncludeSensitive(on);
      setIncludeSensitiveCtx(on);
      setStatus(null);
    },
    [],
  );

  const onSave = useCallback(() => {
    try {
      saveUserContext(form);
      setStatus(t('overview.ctx.saved'));
    } catch {
      setStatus(t('overview.ctx.saveFail'));
    }
  }, [form, t]);

  const onClear = useCallback(() => {
    clearUserContext();
    setForm({
      age: null,
      sex: null,
      heightCm: null,
      medications: null,
      conditions: null,
      targetWeightKg: null,
      focus: null,
      notes: null,
    });
    setStatus(t('overview.ctx.cleared'));
  }, [t]);

  return (
    <details
      className="overview-collapsible user-context-panel"
      data-testid="user-context-panel"
    >
      <summary>{t('overview.ctx.summary')}</summary>
      <div className="overview-collapsible-body">
        <p className="muted user-ctx-hint">{t('overview.ctx.hint')}</p>
        <div className="user-ctx-grid">
          <label className="user-ctx-field">
            <span>{t('overview.ctx.age')}</span>
            <input
              type="number"
              min={1}
              max={120}
              step={1}
              inputMode="numeric"
              autoComplete="off"
              value={toInputString(form.age)}
              onChange={onNum('age')}
              data-testid="user-ctx-age"
            />
          </label>
          <label className="user-ctx-field">
            <span>{t('overview.ctx.sex')}</span>
            <input
              type="text"
              maxLength={20}
              autoComplete="off"
              value={toInputString(form.sex)}
              onChange={onText('sex')}
              data-testid="user-ctx-sex"
            />
          </label>
          <label className="user-ctx-field">
            <span>{t('overview.ctx.height')}</span>
            <input
              type="number"
              min={50}
              max={250}
              step={0.1}
              inputMode="decimal"
              autoComplete="off"
              value={toInputString(form.heightCm)}
              onChange={onNum('heightCm')}
              data-testid="user-ctx-height"
            />
          </label>
          <label className="user-ctx-field">
            <span>{t('overview.ctx.targetWeight')}</span>
            <input
              type="number"
              min={20}
              max={300}
              step={0.1}
              inputMode="decimal"
              autoComplete="off"
              value={toInputString(form.targetWeightKg)}
              onChange={onNum('targetWeightKg')}
              data-testid="user-ctx-weight-target"
            />
          </label>
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.ctx.medications')}</span>
            <input
              type="text"
              maxLength={200}
              autoComplete="off"
              value={toInputString(form.medications)}
              onChange={onText('medications')}
              data-testid="user-ctx-meds"
            />
          </label>
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.ctx.conditions')}</span>
            <input
              type="text"
              maxLength={200}
              autoComplete="off"
              value={toInputString(form.conditions)}
              onChange={onText('conditions')}
              data-testid="user-ctx-conditions"
            />
          </label>
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.ctx.focus')}</span>
            <input
              type="text"
              maxLength={200}
              autoComplete="off"
              value={toInputString(form.focus)}
              onChange={onText('focus')}
              data-testid="user-ctx-focus"
            />
          </label>
          <label className="user-ctx-field user-ctx-field-wide">
            <span>{t('overview.ctx.notes')}</span>
            <textarea
              rows={2}
              maxLength={500}
              value={toInputString(form.notes)}
              onChange={onText('notes')}
              data-testid="user-ctx-notes"
            />
          </label>
        </div>
        <label className="user-ctx-check">
          <input
            type="checkbox"
            checked={includeSensitive}
            onChange={onIncludeSensitive}
            data-testid="user-ctx-include-sensitive"
          />
          <span>{t('overview.ctx.includeSensitive')}</span>
        </label>
        <div className="user-ctx-actions">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            data-testid="user-ctx-save"
            onClick={onSave}
          >
            {t('overview.ctx.save')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            data-testid="user-ctx-clear"
            onClick={onClear}
          >
            {t('overview.ctx.clear')}
          </Button>
          {status ? (
            <span
              className="muted"
              data-testid="user-ctx-status"
              aria-live="polite"
            >
              {status}
            </span>
          ) : (
            <span
              className="muted"
              data-testid="user-ctx-status"
              aria-live="polite"
            />
          )}
        </div>
      </div>
    </details>
  );
}
