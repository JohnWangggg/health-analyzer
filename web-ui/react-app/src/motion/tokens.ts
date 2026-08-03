/**
 * Unified motion tokens — restrained product motion, not marketing thrash.
 * Durations align with CSS --motion-* in theme.css.
 */

export const MOTION = {
  /** Page / workspace enter */
  pageMs: 200,
  /** KPI number / color band */
  valueMs: 280,
  /** Nav pill / underline */
  navMs: 180,
  /** Card stagger step (cap at 3–4 items) */
  staggerMs: 45,
  /** Soft layout reflow (AutoAnimate duration) */
  layoutMs: 200,
  easeOut: [0.22, 1, 0.36, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,
} as const;

export const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
