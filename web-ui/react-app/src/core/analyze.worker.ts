/**
 * Module Worker: parse + analyze off the main thread.
 * Bundled by Vite; uses same @health-analyzer/lib kernel (no reimplementation).
 */
import { parseHealthXml, analyzeAll } from '@health-analyzer/lib';

export type AnalyzeWorkerIn = {
  id: string;
  xml: string;
  locale?: string | null;
};

export type AnalyzeWorkerOut =
  | {
      id: string;
      ok: true;
      analysis: ReturnType<typeof analyzeAll>;
    }
  | { id: string; ok: false; error: string };

// Worker global (avoid DOM lib DedicatedWorkerGlobalScope in app tsconfig)
declare const self: {
  onmessage: ((ev: MessageEvent<AnalyzeWorkerIn>) => void) | null;
  postMessage: (msg: AnalyzeWorkerOut) => void;
};

self.onmessage = (ev: MessageEvent<AnalyzeWorkerIn>) => {
  const msg = ev.data;
  if (!msg || !msg.id || typeof msg.xml !== 'string') {
    self.postMessage({
      id: (msg && msg.id) || 'unknown',
      ok: false,
      error: 'invalid worker message',
    });
    return;
  }
  try {
    const data = parseHealthXml(msg.xml);
    const analysis = analyzeAll(data, { locale: msg.locale ?? null });
    self.postMessage({ id: msg.id, ok: true, analysis });
  } catch (e) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
