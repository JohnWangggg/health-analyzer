import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'neutral' | 'ok' | 'watch' | 'alert' | 'accent';

export function Badge({
  tone = 'neutral',
  children,
  className = '',
  ...rest
}: {
  tone?: Tone;
  children: ReactNode;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`ui-badge ui-badge-${tone} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
