/**
 * IndexedDB：本地保存分析摘要快照，用于历史环比
 * 不上传；仅存压缩 metrics，不含完整 CGM 明细
 */
(function (global) {
  'use strict';

  const DB_NAME = 'health-analyzer-history';
  const DB_VERSION = 1;
  const STORE = 'snapshots';
  const MAX_SNAPSHOTS = 30;

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
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

  global.HealthHistory = {
    saveSnapshot,
    listSnapshots,
    getSnapshot,
    deleteSnapshot,
    clearAll,
    MAX_SNAPSHOTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
