import type { FullAnalysis } from '@health-analyzer/lib';
import type { AnalyzeWorkerIn, AnalyzeWorkerOut } from './analyze.worker';

export type WorkerAnalyzeResult = {
  analysis: FullAnalysis;
  via: 'worker' | 'main';
};

/**
 * Run parse+analyze in a Vite module Worker; falls back to main-thread callback.
 */
export async function analyzeXmlOffMainThread(
  xml: string,
  locale: string | null | undefined,
  mainThreadFallback: () => { analysis: FullAnalysis },
): Promise<WorkerAnalyzeResult> {
  if (typeof Worker === 'undefined') {
    return { analysis: mainThreadFallback().analysis, via: 'main' };
  }

  try {
    // Vite worker constructor
    const WorkerCtor = (
      await import('./analyze.worker.ts?worker')
    ).default as new () => Worker;
    const worker = new WorkerCtor();
    const id = `a_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const analysis = await new Promise<FullAnalysis>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        worker.terminate();
        reject(new Error('analyze worker timeout'));
      }, 5 * 60 * 1000);

      worker.onmessage = (ev: MessageEvent<AnalyzeWorkerOut>) => {
        const msg = ev.data;
        if (!msg || msg.id !== id) return;
        window.clearTimeout(timer);
        worker.terminate();
        if (msg.ok) resolve(msg.analysis);
        else reject(new Error(msg.error || 'worker failed'));
      };
      worker.onerror = (err) => {
        window.clearTimeout(timer);
        worker.terminate();
        reject(err.error || new Error(err.message || 'worker error'));
      };

      const payload: AnalyzeWorkerIn = {
        id,
        xml,
        locale: locale ?? null,
      };
      worker.postMessage(payload);
    });

    return { analysis, via: 'worker' };
  } catch {
    return { analysis: mainThreadFallback().analysis, via: 'main' };
  }
}
