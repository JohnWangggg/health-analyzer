import type { HTMLAttributes, ReactNode } from 'react';

export function Card({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`ui-card ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="ui-card-title">{children}</h2>;
}

export function CardDesc({ children }: { children: ReactNode }) {
  return <p className="ui-card-desc">{children}</p>;
}
