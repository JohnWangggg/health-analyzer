/**
 * HAE 合并 Worker：在后台线程合并 Health Auto Export JSON/CSV，避免大批量导入卡住 UI
 * 依赖同目录 lib.js（importScripts）
 * 仅本地计算，无网络请求
 */
/* eslint-disable no-undef */
importScripts('./lib.js');

const HA = self.HealthAnalyzer;
if (!HA || typeof HA.mergeHaeIntoData !== 'function') {
  self.postMessage({ type: 'worker-error', error: 'HealthAnalyzer.mergeHaeIntoData 未在 Worker 中加载' });
}

self.onmessage = (event) => {
  const msg = event.data || {};
  const id = msg.id;
  const type = msg.type;

  if (type !== 'merge') {
    self.postMessage({ id, type: 'error', error: '未知消息类型: ' + type });
    return;
  }

  try {
    if (!HA || typeof HA.mergeHaeIntoData !== 'function') {
      throw new Error('HealthAnalyzer.mergeHaeIntoData 不可用');
    }

    const payload = msg.payload || {};
    const data = payload.data;
    const files = payload.files || [];
    const options = payload.options || {};

    if (data == null || typeof data !== 'object') {
      throw new Error('Worker 未收到可合并的 HealthData');
    }
    if (!Array.isArray(files) || !files.length) {
      throw new Error('Worker 未收到 HAE 文件');
    }

    // 轻量进度：开始合并
    self.postMessage({ id, type: 'progress', progress: { phase: 'merge', pct: 0.1 } });

    // mergeHaeIntoData 就地修改 data，返回 HaeImportStats
    const stats = HA.mergeHaeIntoData(data, files, options);

    self.postMessage({ id, type: 'progress', progress: { phase: 'merge', pct: 1 } });
    // 结构化克隆回主线程：mutated data + stats
    self.postMessage({ id, type: 'result', data, stats });
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      error: err && err.message ? err.message : String(err),
    });
  }
};
