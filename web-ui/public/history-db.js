/**
 * IndexedDB：本地保存分析摘要快照 + 周报历史 + 事件时间线 + 导入批次可追溯
 * 不上传；仅存压缩 metrics / markdown / 手录事件 / 导入摘要，不含完整 CGM 明细
 */
(function (global) {
  'use strict';

  const DB_NAME = 'health-analyzer-history';
  /** v4：新增 importBatches object store（本机导入可追溯） */
  const DB_VERSION = 4;
  const STORE = 'snapshots';
  const STORE_REPORTS = 'weeklyReports';
  const STORE_EVENTS = 'healthEvents';
  const STORE_IMPORT_BATCHES = 'importBatches';
  const MAX_SNAPSHOTS = 30;
  const MAX_WEEKLY_REPORTS = 20;
  const MAX_EVENTS = 500;
  const MAX_IMPORT_BATCHES = 50;

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
        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          const events = db.createObjectStore(STORE_EVENTS, { keyPath: 'id' });
          events.createIndex('date', 'date', { unique: false });
          events.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
          const batches = db.createObjectStore(STORE_IMPORT_BATCHES, { keyPath: 'id' });
          batches.createIndex('createdAt', 'createdAt', { unique: false });
        }
        // 兼容：从 v1–v3 升到 v4 时确保各 store 存在
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

  /** 仅清空摘要快照 store（兼容旧「清空历史」按钮） */
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

  /**
   * 清空全部本机健康历史 store：摘要快照 + 周报历史 + 事件时间线 + 导入批次
   * 供「清除所有本机健康数据」一键使用
   */
  function clearAllStores() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const names = [STORE];
          if (db.objectStoreNames.contains(STORE_REPORTS)) {
            names.push(STORE_REPORTS);
          }
          if (db.objectStoreNames.contains(STORE_EVENTS)) {
            names.push(STORE_EVENTS);
          }
          if (db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
            names.push(STORE_IMPORT_BATCHES);
          }
          const tx = db.transaction(names, 'readwrite');
          for (const n of names) {
            tx.objectStore(n).clear();
          }
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

  // ---------- 事件时间线（独立 store，最多 MAX_EVENTS） ----------

  /**
   * @typedef {object} HealthEventRecord
   * @property {string} id
   * @property {string} kind
   * @property {string} date YYYY-MM-DD
   * @property {string} [endDate]
   * @property {string} title
   * @property {string} [note]
   * @property {number|null} [intensity]
   * @property {string} [source]
   * @property {string} createdAt ISO
   */

  function eventSortKey(e) {
    return String(e && e.date != null ? e.date : '') + '\0' + String(e && e.createdAt != null ? e.createdAt : '');
  }

  function listHealthEvents() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_EVENTS)) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction(STORE_EVENTS, 'readonly');
          const store = tx.objectStore(STORE_EVENTS);
          const req = store.getAll();
          req.onsuccess = () => {
            const rows = (req.result || []).sort((a, b) =>
              eventSortKey(b).localeCompare(eventSortKey(a))
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

  function getHealthEvent(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_EVENTS)) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction(STORE_EVENTS, 'readonly');
          const req = tx.objectStore(STORE_EVENTS).get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        })
    );
  }

  function deleteHealthEvent(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_EVENTS)) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(STORE_EVENTS, 'readwrite');
          tx.objectStore(STORE_EVENTS).delete(id);
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
   * 保存单条事件；超过 MAX_EVENTS 时按 date/createdAt 删最旧
   * @param {HealthEventRecord} event
   */
  function saveHealthEvent(event) {
    if (!event || !event.id) {
      return Promise.reject(new Error('event.id 不能为空'));
    }
    const record = Object.assign({}, event, {
      id: String(event.id),
      kind: event.kind != null ? String(event.kind) : 'custom',
      date: event.date != null ? String(event.date).slice(0, 10) : '',
      endDate:
        event.endDate != null && String(event.endDate).trim()
          ? String(event.endDate).slice(0, 10)
          : '',
      title: event.title != null ? String(event.title) : '',
      note: event.note != null ? String(event.note) : '',
      intensity:
        event.intensity != null && Number.isFinite(Number(event.intensity))
          ? Number(event.intensity)
          : null,
      source: event.source != null ? String(event.source) : 'manual',
      createdAt: event.createdAt || new Date().toISOString(),
    });

    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(STORE_EVENTS)) {
              db.close();
              reject(new Error('事件时间线 store 不可用，请刷新页面'));
              return;
            }
            const tx = db.transaction(STORE_EVENTS, 'readwrite');
            tx.objectStore(STORE_EVENTS).put(record);
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
        const all = await listHealthEvents();
        if (all.length > MAX_EVENTS) {
          // list 已 date desc；最旧 = 尾部，按 date/createdAt 升序删
          const extra = [...all]
            .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
            .slice(0, all.length - MAX_EVENTS);
          for (const s of extra) {
            await deleteHealthEvent(s.id);
          }
        }
        return saved;
      });
  }

  /**
   * 批量写入（导入）；同 id 覆盖；写完后裁剪至 MAX_EVENTS
   * @param {HealthEventRecord[]} events
   */
  function saveHealthEventsBulk(events) {
    const list = Array.isArray(events) ? events : [];
    if (!list.length) return Promise.resolve([]);

    const now = new Date().toISOString();
    const records = list
      .filter((e) => e && e.id)
      .map((event) =>
        Object.assign({}, event, {
          id: String(event.id),
          kind: event.kind != null ? String(event.kind) : 'custom',
          date: event.date != null ? String(event.date).slice(0, 10) : '',
          endDate:
            event.endDate != null && String(event.endDate).trim()
              ? String(event.endDate).slice(0, 10)
              : '',
          title: event.title != null ? String(event.title) : '',
          note: event.note != null ? String(event.note) : '',
          intensity:
            event.intensity != null && Number.isFinite(Number(event.intensity))
              ? Number(event.intensity)
              : null,
          source: event.source != null ? String(event.source) : 'manual',
          createdAt: event.createdAt || now,
        })
      );

    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(STORE_EVENTS)) {
              db.close();
              reject(new Error('事件时间线 store 不可用，请刷新页面'));
              return;
            }
            const tx = db.transaction(STORE_EVENTS, 'readwrite');
            const store = tx.objectStore(STORE_EVENTS);
            for (const r of records) {
              store.put(r);
            }
            tx.oncomplete = () => {
              db.close();
              resolve(records);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          })
      )
      .then(async (saved) => {
        const all = await listHealthEvents();
        if (all.length > MAX_EVENTS) {
          const extra = [...all]
            .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
            .slice(0, all.length - MAX_EVENTS);
          for (const s of extra) {
            await deleteHealthEvent(s.id);
          }
        }
        return saved;
      });
  }

  function clearHealthEvents() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_EVENTS)) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(STORE_EVENTS, 'readwrite');
          tx.objectStore(STORE_EVENTS).clear();
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

  // ---------- 导入批次可追溯（独立 store，最多 MAX_IMPORT_BATCHES） ----------

  /**
   * @typedef {object} ImportBatchRecord
   * @property {string} id
   * @property {string} createdAt ISO
   * @property {string} source
   * @property {Array<{name:string,bytes:number,sha256?:string|null}>} files
   * @property {number} totalBytes
   * @property {object} stats
   * @property {string} ruleVersion
   * @property {string[]} [notes]
   * @property {boolean} [cancelled]
   */

  function listImportBatches() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
            db.close();
            resolve([]);
            return;
          }
          const tx = db.transaction(STORE_IMPORT_BATCHES, 'readonly');
          const store = tx.objectStore(STORE_IMPORT_BATCHES);
          const req = store.getAll();
          req.onsuccess = () => {
            const rows = (req.result || []).sort((a, b) =>
              String(b.createdAt).localeCompare(String(a.createdAt))
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

  function getImportBatch(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction(STORE_IMPORT_BATCHES, 'readonly');
          const store = tx.objectStore(STORE_IMPORT_BATCHES);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        })
    );
  }

  function deleteImportBatch(id) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(STORE_IMPORT_BATCHES, 'readwrite');
          tx.objectStore(STORE_IMPORT_BATCHES).delete(id);
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

  function saveImportBatch(batch) {
    if (!batch || typeof batch !== 'object') {
      return Promise.reject(new Error('invalid import batch'));
    }
    // Prefer lib normalizer when available
    let record = batch;
    try {
      if (
        global.HealthAnalyzer &&
        typeof global.HealthAnalyzer.normalizeImportBatch === 'function'
      ) {
        const n = global.HealthAnalyzer.normalizeImportBatch(batch);
        if (n) record = n;
      }
    } catch (_) {
      /* keep raw */
    }
    if (!record.id) {
      if (
        global.HealthAnalyzer &&
        typeof global.HealthAnalyzer.createImportBatchId === 'function'
      ) {
        record.id = global.HealthAnalyzer.createImportBatchId();
      } else {
        record.id = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      }
    }
    if (!record.createdAt) record.createdAt = new Date().toISOString();

    return openDb()
      .then(
        (db) =>
          new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
              db.close();
              reject(new Error('importBatches store missing'));
              return;
            }
            const tx = db.transaction(STORE_IMPORT_BATCHES, 'readwrite');
            tx.objectStore(STORE_IMPORT_BATCHES).put(record);
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
        const all = await listImportBatches();
        if (all.length > MAX_IMPORT_BATCHES) {
          const extra = [...all]
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
            .slice(0, all.length - MAX_IMPORT_BATCHES);
          for (const s of extra) {
            await deleteImportBatch(s.id);
          }
        }
        return saved;
      });
  }

  function clearImportBatches() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(STORE_IMPORT_BATCHES, 'readwrite');
          tx.objectStore(STORE_IMPORT_BATCHES).clear();
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
    clearAllStores,
    MAX_SNAPSHOTS,
    // 周报
    saveWeeklyReport,
    listWeeklyReports,
    getWeeklyReport,
    deleteWeeklyReport,
    clearWeeklyReports,
    MAX_WEEKLY_REPORTS,
    // 事件时间线
    saveHealthEvent,
    listHealthEvents,
    getHealthEvent,
    deleteHealthEvent,
    clearHealthEvents,
    saveHealthEventsBulk,
    MAX_EVENTS,
    // 导入批次可追溯
    saveImportBatch,
    listImportBatches,
    getImportBatch,
    clearImportBatches,
    MAX_IMPORT_BATCHES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
