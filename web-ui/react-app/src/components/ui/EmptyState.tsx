import type { ReactNode } from 'react';
import { Button } from './Button';

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  testId,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
}) {
  return (
    <div className="ui-empty" data-testid={testId}>
      <h2 className="ui-empty-title">{title}</h2>
      {description ? <p className="ui-empty-desc">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="ui-loading" role="status" data-testid="loading-state">
      {label}
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
