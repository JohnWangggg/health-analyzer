import { m } from 'motion/react';
import { MOTION } from '../../motion/tokens';

type Props = {
  score: number | null;
  size?: number;
  label?: string;
  sub?: string;
};

/**
 * Low-risk status focus: SVG ring draw + score number.
 * No particles, no trails — clinical calm.
 */
export function RecoveryRing({
  score,
  size = 128,
  label = '恢复分',
  sub,
}: Props) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct =
    score == null || !Number.isFinite(score)
      ? 0
      : Math.max(0, Math.min(100, score)) / 100;
  const offset = c * (1 - pct);
  const display = score == null ? '—' : String(Math.round(score));

  return (
    <div
      className="recovery-ring"
      data-testid="recovery-ring"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="recovery-ring-svg"
        aria-hidden
      >
        <circle
          className="recovery-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <m.circle
          className="recovery-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{
            duration: MOTION.valueMs / 1000,
            ease: MOTION.easeOut,
          }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="recovery-ring-center">
        <span className="recovery-ring-label">{label}</span>
        <m.span
          key={display}
          className="recovery-ring-value status-band-value"
          initial={{ opacity: 0.35, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION.valueMs / 1000 }}
        >
          {display}
        </m.span>
        {sub ? <span className="recovery-ring-sub muted">{sub}</span> : null}
      </div>
    </div>
  );
}
