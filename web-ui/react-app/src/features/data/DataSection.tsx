import type { ReactNode } from 'react';

/**
 * Narrative section on the Data page — groups related tools under one story.
 */
export function DataSection({
  title,
  lead,
  children,
  testId,
  tone = 'default',
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  testId?: string;
  tone?: 'default' | 'privacy' | 'export' | 'space';
}) {
  return (
    <section
      className={`data-section data-section-${tone}`}
      data-testid={testId}
    >
      <header className="data-section-head">
        <h2 className="data-section-title">{title}</h2>
        {lead ? <p className="data-section-lead muted">{lead}</p> : null}
      </header>
      <div className="data-section-body">{children}</div>
    </section>
  );
}
