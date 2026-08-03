import { useAutoAnimate as useFormkitAutoAnimate } from '@formkit/auto-animate/react';
import { MOTION, prefersReducedMotion } from './tokens';

/**
 * AutoAnimate for list/card reflows (KPI order, signals, shard lists).
 * Zero-duration when prefers-reduced-motion (no visual thrash).
 */
export function useAutoAnimate<T extends Element = HTMLElement>(
  opts?: { duration?: number; disrespectUserMotionPreference?: boolean },
) {
  const reduce =
    !opts?.disrespectUserMotionPreference && prefersReducedMotion();
  const duration = reduce ? 0 : (opts?.duration ?? MOTION.layoutMs);
  return useFormkitAutoAnimate<T>({
    duration,
    easing: 'ease-out',
  });
}
