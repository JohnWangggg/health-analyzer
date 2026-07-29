/**
 * IndexedDB：本地保存分析摘要快照 + 周报历史
 * 不上传；仅存压缩 metrics / markdown，不含完整 CGM 明细
 */
(function (global) {
  'use strict';

  const DB_NAME = 'health-analyzer-history';
  /** v2：新增 weeklyReports object store */
  const DB_VERSION = 2;
  const STORE = 'snapshots';
  const STORE_REPORTS = 'weeklyReports';
  const MAX_SNAPSHOTS = 30;
  const MAX_WEEKLY_REPORTS = 20;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_REPORTS)) {
          const reports = db.createObjectStore(STORE_REPORTS, { keyPath: 'id' });
          reports.createIndex('savedAt', 'savedAt', { unique: false });
          reports.createIndex('weekEnd', 'weekEnd', { unique: false });
        }
        // 兼容：从 v1 升到 v2 时确保 reports store 存在
        void ev;
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('打开 IndexedDB 失败'));
    });
  }

  function listSnapshots() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const store = tx.objectStore(STORE);
          const req = store.getAll();
          req.onsuccess = () => {
            const rows = (req.result || []).sort((a, b) =>
              String(b.savedAt).localeCompare(String(a.savedAt))
            );
            resolve(rows);
          };
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  function getSnapshot(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const store = tx.objectStore(STORE);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        })
    );
  }

  function deleteSnapshot(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  function saveSnapshot(snapshot) {
    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(snapshot);
            tx.oncomplete = () => {
              db.close();
              resolve(snapshot);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          })
      )
      .then(async (saved) => {
        const all = await listSnapshots();
        if (all.length > MAX_SNAPSHOTS) {
          const extra = [...all]
            .sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)))
            .slice(0, all.length - MAX_SNAPSHOTS);
          for (const s of extra) {
            await deleteSnapshot(s.id);
          }
        }
        return saved;
      });
  }

  function clearAll() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  // ---------- 周报历史（独立 store，最多 MAX_WEEKLY_REPORTS） ----------

  /**
   * @typedef {object} WeeklyReportRecord
   * @property {string} id
   * @property {string} savedAt ISO
   * @property {string} weekEnd
   * @property {string} markdown
   * @property {string} [label]
   * @property {number|null} [recoveryScore]
   * @property {number|null} [loadScore]
   */

  function listWeeklyReports() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_REPORTS)) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction(STORE_REPORTS, 'readonly');
          const store = tx.objectStore(STORE_REPORTS);
          const req = store.getAll();
          req.onsuccess = () => {
            const rows = (req.result || []).sort((a, b) =>
              String(b.savedAt).localeCompare(String(a.savedAt))
            );
            resolve(rows);
          };
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  function getWeeklyReport(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_REPORTS)) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction(STORE_REPORTS, 'readonly');
          const req = tx.objectStore(STORE_REPORTS).get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        })
    );
  }

  function deleteWeeklyReport(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_REPORTS)) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(STORE_REPORTS, 'readwrite');
          tx.objectStore(STORE_REPORTS).delete(id);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  /**
   * 保存周报快照；自动裁剪至 MAX_WEEKLY_REPORTS（删最旧）
   * @param {Partial<WeeklyReportRecord> & { markdown: string }} input
   */
  function saveWeeklyReport(input) {
    if (!input || !input.markdown) {
      return Promise.reject(new Error('markdown 不能为空'));
    }
    const record = {
      id:
        input.id ||
        `wr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: input.savedAt || new Date().toISOString(),
      weekEnd: input.weekEnd || '',
      markdown: String(input.markdown),
      label: input.label != null ? String(input.label) : '',
      recoveryScore:
        input.recoveryScore != null && Number.isFinite(input.recoveryScore)
          ? input.recoveryScore
          : null,
      loadScore:
        input.loadScore != null && Number.isFinite(input.loadScore)
          ? input.loadScore
          : null,
    };

    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(STORE_REPORTS)) {
              db.close();
              reject(new Error('周报历史 store 不可用，请刷新页面'));
              return;
            }
            const tx = db.transaction(STORE_REPORTS, 'readwrite');
            tx.objectStore(STORE_REPORTS).put(record);
            tx.oncomplete = () => {
              db.close();
              resolve(record);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          })
      )
      .then(async (saved) => {
        const all = await listWeeklyReports();
        if (all.length > MAX_WEEKLY_REPORTS) {
          const extra = [...all]
            .sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)))
            .slice(0, all.length - MAX_WEEKLY_REPORTS);
          for (const s of extra) {
            await deleteWeeklyReport(s.id);
          }
        }
        return saved;
      });
  }

  function clearWeeklyReports() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_REPORTS)) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(STORE_REPORTS, 'readwrite');
          tx.objectStore(STORE_REPORTS).clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  global.HealthHistory = {
    saveSnapshot,
    listSnapshots,
    getSnapshot,
    deleteSnapshot,
    clearAll,
    MAX_SNAPSHOTS,
    // 周报
    saveWeeklyReport,
    listWeeklyReports,
    getWeeklyReport,
    deleteWeeklyReport,
    clearWeeklyReports,
    MAX_WEEKLY_REPORTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
