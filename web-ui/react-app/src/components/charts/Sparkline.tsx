/**
 * Lightweight SVG sparkline — no ECharts, safe for overview first paint.
 */
export function Sparkline({
  values,
  width = 120,
  height = 36,
  className,
  stroke,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
}) {
  if (values.length < 2) {
    return (
      <svg
        className={className}
        width={width}
        height={height}
        aria-hidden
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          x1={8}
          y1={height / 2}
          x2={width - 8}
          y2={height / 2}
          className="sparkline-empty"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * innerW;
      const y = pad + (1 - (v - min) / span) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <polyline
        className="sparkline-line"
        fill="none"
        stroke={stroke || 'currentColor'}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}
