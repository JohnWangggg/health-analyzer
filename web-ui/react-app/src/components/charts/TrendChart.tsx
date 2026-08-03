import { useEffect, useRef, useState } from 'react';
import type { SeriesPoint } from '../../core/HealthCoreAdapter';

export type TrendChartProps = {
  title: string;
  unit: string;
  points: SeriesPoint[];
  /** Optional secondary series (compare metric; own unit in legend). */
  compareTitle?: string;
  compareUnit?: string;
  comparePoints?: SeriesPoint[];
};

/**
 * Lazy-loads a **tree-shaken** ECharts build (line + grid + tooltip + dataZoom only).
 * Overview must not import this module so first paint stays free of ECharts.
 */
export function TrendChart({
  title,
  unit,
  points,
  compareTitle,
  compareUnit,
  comparePoints,
}: TrendChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<'echarts' | 'fallback' | 'loading'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);
  const hasCompare = !!(comparePoints && comparePoints.length > 0 && compareTitle);

  useEffect(() => {
    let disposed = false;
    let chart: {
      dispose: () => void;
      setOption: (o: unknown) => void;
      resize?: () => void;
    } | null = null;

    async function mount() {
      if (!hostRef.current) return;
      if (!points.length) {
        setEngine('fallback');
        return;
      }
      try {
        const echarts = await import('echarts/core');
        const { LineChart } = await import('echarts/charts');
        const {
          GridComponent,
          TooltipComponent,
          TitleComponent,
          DataZoomComponent,
          LegendComponent,
        } = await import('echarts/components');
        const { CanvasRenderer } = await import('echarts/renderers');

        echarts.use([
          LineChart,
          GridComponent,
          TooltipComponent,
          TitleComponent,
          DataZoomComponent,
          LegendComponent,
          CanvasRenderer,
        ]);

        if (disposed || !hostRef.current) return;

        // Align dates: union of primary + compare for dual axis
        const dateSet = new Set(points.map((p) => p.date));
        if (hasCompare) {
          for (const p of comparePoints!) dateSet.add(p.date);
        }
        const dates = [...dateSet].sort();
        const primaryMap = new Map(points.map((p) => [p.date, p.value]));
        const compareMap = hasCompare
          ? new Map(comparePoints!.map((p) => [p.date, p.value]))
          : null;

        chart = echarts.init(hostRef.current, undefined, {
          renderer: 'canvas',
        });
        chart.setOption({
          animation: true,
          title: { text: title, left: 0, textStyle: { fontSize: 13 } },
          legend: hasCompare
            ? {
                top: 0,
                right: 8,
                data: [title, compareTitle],
              }
            : undefined,
          tooltip: { trigger: 'axis' },
          grid: {
            left: 48,
            right: hasCompare ? 48 : 16,
            top: hasCompare ? 48 : 40,
            bottom: 32,
          },
          xAxis: {
            type: 'category',
            data: dates,
            boundaryGap: false,
          },
          yAxis: hasCompare
            ? [
                { type: 'value', name: unit, scale: true },
                {
                  type: 'value',
                  name: compareUnit || '',
                  scale: true,
                  splitLine: { show: false },
                },
              ]
            : {
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
              yAxisIndex: 0,
              showSymbol: dates.length < 40,
              data: dates.map((d) =>
                primaryMap.has(d) ? primaryMap.get(d)! : null,
              ),
              areaStyle: { opacity: 0.08 },
              connectNulls: false,
            },
            ...(hasCompare
              ? [
                  {
                    name: compareTitle,
                    type: 'line',
                    smooth: true,
                    yAxisIndex: 1,
                    showSymbol: dates.length < 40,
                    data: dates.map((d) =>
                      compareMap!.has(d) ? compareMap!.get(d)! : null,
                    ),
                    connectNulls: false,
                    lineStyle: { type: 'dashed' as const },
                  },
                ]
              : []),
          ],
        });
        setEngine('echarts');
        setError(null);
        const onResize = () => chart?.resize?.();
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
  }, [points, title, unit, compareTitle, compareUnit, comparePoints, hasCompare]);

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
        <p className="muted">正在加载本地 ECharts（按需组件）…</p>
      ) : null}
      {error ? (
        <p className="status-err" data-testid="chart-error">
          图表引擎回退：{error}
        </p>
      ) : null}
      {engine === 'echarts' ? (
        <p className="muted" data-testid="echarts-active">
          主趋势：ECharts core 按需构建（非 CDN、非全量包）
          {hasCompare ? ' · 双轴对比' : ''}
        </p>
      ) : null}
    </div>
  );
}
