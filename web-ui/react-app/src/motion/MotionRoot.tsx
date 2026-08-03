import { LazyMotion, domAnimation, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Tree-shakeable Motion feature pack (domAnimation only — no layout projection bundle).
 * Respects OS prefers-reduced-motion via MotionConfig.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
