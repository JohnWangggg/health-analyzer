import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { MOTION, prefersReducedMotion } from './tokens';

/**
 * Restrained stagger for 2–6 workspace sections.
 * Caps delay so pages never feel like marketing slides.
 */
export function Stagger({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const reduce = prefersReducedMotion();
  return (
    <m.div
      className={className}
      data-testid={testId}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : MOTION.staggerMs / 1000,
            delayChildren: reduce ? 0 : 0.02,
          },
        },
      }}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = prefersReducedMotion();
  return (
    <m.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: MOTION.pageMs / 1000,
            ease: MOTION.easeOut,
          },
        },
      }}
    >
      {children}
    </m.div>
  );
}
