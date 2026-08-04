import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { Button } from './Button';

/**
 * Lightweight, auto-dismiss success strip — not a modal.
 * Optional secondary action (e.g. open Trends) pauses auto-hide while focused optionally via long autoHideMs.
 */
export function SuccessBanner({
  message,
  detail,
  onDismiss,
  autoHideMs = 5200,
  testId = 'success-banner',
  actionLabel,
  onAction,
}: {
  message: string;
  detail?: string | null;
  onDismiss: () => void;
  autoHideMs?: number;
  testId?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  useEffect(() => {
    if (!autoHideMs || autoHideMs <= 0) return;
    const id = window.setTimeout(onDismiss, autoHideMs);
    return () => window.clearTimeout(id);
  }, [autoHideMs, onDismiss, message]);

  return (
    <div
      className="ui-success-banner"
      role="status"
      aria-live="polite"
      data-testid={testId}
    >
      <CheckCircle2 className="ui-success-icon" size={18} aria-hidden />
      <div className="ui-success-copy">
        <span className="ui-success-message">{message}</span>
        {detail ? <span className="ui-success-detail muted">{detail}</span> : null}
      </div>
      <div className="ui-success-actions">
        {actionLabel && onAction ? (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => {
              onAction();
              onDismiss();
            }}
            data-testid={`${testId}-action`}
          >
            {actionLabel}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onDismiss}
          data-testid={`${testId}-dismiss`}
          aria-label="Dismiss"
        >
          <X size={16} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
