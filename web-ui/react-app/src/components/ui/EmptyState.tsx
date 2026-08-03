import type { ReactNode } from 'react';
import { Activity, FileText, HeartPulse, Inbox } from 'lucide-react';
import { Button } from './Button';

export type EmptyKind = 'overview' | 'trends' | 'reports' | 'generic';

const ICONS: Record<EmptyKind, typeof Inbox> = {
  overview: HeartPulse,
  trends: Activity,
  reports: FileText,
  generic: Inbox,
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  testId,
  kind = 'generic',
  steps,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
  kind?: EmptyKind;
  /** Optional short product steps under the description */
  steps?: string[];
}) {
  const Icon = ICONS[kind];
  return (
    <div className={`ui-empty ui-empty-${kind}`} data-testid={testId}>
      <div className="ui-empty-icon" aria-hidden>
        <Icon size={28} strokeWidth={1.75} />
      </div>
      <h2 className="ui-empty-title">{title}</h2>
      {description ? <p className="ui-empty-desc">{description}</p> : null}
      {steps && steps.length ? (
        <ol className="ui-empty-steps">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({
  label = '加载中…',
  detail,
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <div className="ui-loading" role="status" data-testid="loading-state">
      <span className="ui-loading-pulse" aria-hidden />
      <div className="ui-loading-copy">
        <span className="ui-loading-label">{label}</span>
        {detail ? <span className="ui-loading-detail muted">{detail}</span> : null}
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="ui-error" role="alert" data-testid="error-state">
      <p>{message}</p>
      {children}
    </div>
  );
}
