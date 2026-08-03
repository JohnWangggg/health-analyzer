import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { MOTION, pageVariants } from './tokens';

/**
 * Subtle workspace enter: fade + 8px rise, 180–240ms.
 * Skip thrash: no scale, no blur, no long delays.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <m.div
      key={pathname}
      className="page-transition"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{
        duration: MOTION.pageMs / 1000,
        ease: MOTION.easeOut,
      }}
    >
      {children}
    </m.div>
  );
}
