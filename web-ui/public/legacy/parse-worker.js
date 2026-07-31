/**
 * 解析 Worker：在后台线程运行 Apple Health XML 解析，避免卡住 UI
 * 依赖同目录 lib.js（importScripts）
 */
/* eslint-disable no-undef */
importScripts('./lib.js');

const HA = self.HealthAnalyzer;
if (!HA || typeof HA.parseHealthXmlAsync !== 'function') {
  // 立即报错便于主线程感知
  self.postMessage({ type: 'worker-error', error: 'HealthAnalyzer 未在 Worker 中加载' });
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  const id = msg.id;
  const type = msg.type;

  if (type !== 'parse') {
    self.postMessage({ id, type: 'error', error: '未知消息类型: ' + type });
    return;
  }

  try {
    const payload = msg.payload || {};
    const options = {
      startDate: payload.startDate || undefined,
      endDate: payload.endDate || undefined,
      onProgress: (p) => {
        self.postMessage({ id, type: 'progress', progress: p });
      },
    };

    let source = payload.source;
    // 支持 ArrayBuffer / Uint8Array / string
    if (payload.buffer) {
      source = new Uint8Array(payload.buffer);
    } else if (source && source.byteLength != null && !(source instanceof Uint8Array) && typeof source !== 'string') {
      source = new Uint8Array(source);
    }

    if (source == null || (typeof source === 'string' && source.length === 0)) {
      throw new Error('Worker 未收到可解析的 XML 数据');
    }

    const data = await HA.parseHealthXmlAsync(source, options);
    // 结构化克隆回主线程
    self.postMessage({ id, type: 'result', data });
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      error: err && err.message ? err.message : String(err),
    });
  }
};
