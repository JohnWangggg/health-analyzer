import { useEffect, useRef, useState } from 'react';
import type { SeriesPoint } from '../../core/HealthCoreAdapter';

export type TrendChartProps = {
  title: string;
  unit: string;
  points: SeriesPoint[];
};

/**
 * Lazy-loads echarts only when this component mounts (Trends route).
 * Overview must not import this module so first paint stays free of ECharts.
 */
export function TrendChart({ title, unit, points }: TrendChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<'echarts' | 'fallback' | 'loading'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let chart: { dispose: () => void; setOption: (o: unknown) => void } | null =
      null;

    async function mount() {
      if (!hostRef.current) return;
      if (!points.length) {
        setEngine('fallback');
        return;
      }
      try {
        // Dynamic import — separate chunk; not in Overview graph
        const echarts = await import('echarts');
        if (disposed || !hostRef.current) return;
        chart = echarts.init(hostRef.current, undefined, {
          renderer: 'canvas',
        });
        chart.setOption({
          animation: true,
          title: { text: title, left: 0, textStyle: { fontSize: 13 } },
          tooltip: { trigger: 'axis' },
          grid: { left: 48, right: 16, top: 40, bottom: 32 },
          xAxis: {
            type: 'category',
            data: points.map((p) => p.date),
            boundaryGap: false,
          },
          yAxis: {
            type: 'value',
            name: unit,
            scale: true,
          },
          dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18 }],
          series: [
            {
              name: title,
              type: 'line',
              smooth: true,
              showSymbol: points.length < 40,
              data: points.map((p) => p.value),
              areaStyle: { opacity: 0.08 },
            },
          ],
        });
        setEngine('echarts');
        setError(null);
        const onResize = () => {
          // echarts Instance has resize
          (chart as { resize?: () => void } | null)?.resize?.();
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      } catch (e) {
        if (!disposed) {
          setEngine('fallback');
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    const cleanupPromise = mount();
    return () => {
      disposed = true;
      void cleanupPromise;
      chart?.dispose();
    };
  }, [points, title, unit]);

  return (
    <div data-testid="trend-chart" data-engine={engine}>
      <div
        ref={hostRef}
        className="chart-host"
        role="img"
        aria-label={`${title} 趋势图，单位 ${unit}，共 ${points.length} 点`}
        data-testid="echarts-host"
      />
      {engine === 'loading' ? (
        <p className="muted">正在加载本地 ECharts…</p>
      ) : null}
      {error ? (
        <p className="status-err" data-testid="chart-error">
          图表引擎回退：{error}
        </p>
      ) : null}
      {engine === 'echarts' ? (
        <p className="muted" data-testid="echarts-active">
          主趋势：本地 Apache ECharts（npm 打包，非 CDN）
        </p>
      ) : null}
    </div>
  );
}
