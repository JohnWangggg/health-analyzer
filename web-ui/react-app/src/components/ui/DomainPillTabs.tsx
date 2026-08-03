import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { prefersReducedMotion } from '../../motion/tokens';

export type DomainPillItem = {
  id: string;
  label: string;
  testId?: string;
  hasData?: boolean;
  disabled?: boolean;
};

/**
 * Segmented control with a sliding selection pill (CSS transform, not layout thrash).
 * Respects prefers-reduced-motion.
 */
export function DomainPillTabs({
  items,
  value,
  onChange,
  'aria-label': ariaLabel,
  testId,
  trailing,
}: {
  items: DomainPillItem[];
  value: string;
  onChange: (id: string) => void;
  'aria-label'?: string;
  testId?: string;
  trailing?: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });
  const reduce = prefersReducedMotion();

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const active = track.querySelector<HTMLElement>(
      `[data-pill-id="${CSS.escape(value)}"]`,
    );
    if (!active) {
      setPill((p) => ({ ...p, ready: false }));
      return;
    }
    const tr = track.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    setPill({
      x: ar.left - tr.left + track.scrollLeft,
      w: ar.width,
      ready: true,
    });
  }, [value, items]);

  return (
    <div className="domain-pill-row">
      <div
        ref={trackRef}
        className="domain-switcher domain-switcher-pills"
        role="tablist"
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {pill.ready ? (
          <span
            className="domain-pill-thumb"
            data-reduce={reduce ? '1' : '0'}
            style={{
              width: pill.w,
              transform: `translateX(${pill.x}px)`,
            }}
            aria-hidden
          />
        ) : null}
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-pill-id={item.id}
              data-testid={item.testId}
              data-has-data={item.hasData ? '1' : '0'}
              disabled={item.disabled}
              className={[
                'domain-pill-tab',
                'ui-btn',
                'ui-btn-sm',
                selected ? 'is-selected' : '',
                item.hasData === false ? 'domain-tab-empty' : 'domain-tab-has-data',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {trailing ? <div className="domain-pill-trailing">{trailing}</div> : null}
    </div>
  );
}
