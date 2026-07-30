/**
 * IndexedDB：本地保存分析摘要快照 + 周报历史 + 事件时间线 + 导入批次可追溯
 * + v1.68 可选原始 HealthData 仓（须用户授权；默认不落盘明细）
 * + v1.75 CGM 按月分片 domainChunks（core|full + cgm|YYYY-MM；兼容 healthData|full）
 * + v1.79 BP/体重按年分片（bloodPressure|YYYY、weight|YYYY；bodyFat 并入 weight 年片）
 * 不上传；摘要仓不含完整 CGM；原始仓仅在 consent 开启后写入
 */
(function (global) {
  'use strict';

  const DB_NAME = 'health-analyzer-history';
  /** v5：warehouseMeta + domainChunks（原始数据仓，opt-in） */
  const DB_VERSION = 5;
  const STORE = 'snapshots';
  const STORE_REPORTS = 'weeklyReports';
  const STORE_EVENTS = 'healthEvents';
  const STORE_IMPORT_BATCHES = 'importBatches';
  const STORE_WH_META = 'warehouseMeta';
  const STORE_WH_CHUNKS = 'domainChunks';
  const MAX_SNAPSHOTS = 30;
  const MAX_WEEKLY_REPORTS = 20;
  const MAX_EVENTS = 500;
  const MAX_IMPORT_BATCHES = 50;
  /** Soft / hard byte caps for raw warehouse (approx JSON size) */
  const WAREHOUSE_SOFT_BYTES = 150 * 1024 * 1024;
  const WAREHOUSE_HARD_BYTES = 200 * 1024 * 1024;
  const WAREHOUSE_POLICY_VERSION = 'data-center-v1.79.0';
  /** @deprecated legacy single-blob id; still read for migrate */
  const WH_CHUNK_HEALTH = 'healthData|full';
  const WH_CHUNK_CORE = 'core|full';
  const WH_META_ID = 'primary';
  const WH_DOMAIN_CGM = 'cgm';
  const WH_DOMAIN_BP = 'bloodPressure';
  const WH_DOMAIN_WEIGHT = 'weight';

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
        if (!db.objectStoreNames.contains(STORE_WH_META)) {
          db.createObjectStore(STORE_WH_META, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_WH_CHUNKS)) {
          const chunks = db.createObjectStore(STORE_WH_CHUNKS, { keyPath: 'id' });
          chunks.createIndex('domain', 'domain', { unique: false });
          chunks.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        // 兼容：从 v1–v4 升到 v5 时确保各 store 存在
        void ev;
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('打开 IndexedDB 失败'));
    });
  }

  function defaultWarehouseMeta() {
    return {
      id: WH_META_ID,
      formatVersion: 1,
      consent: {
        granted: false,
        grantedAt: null,
        revokedAt: null,
        policyVersion: WAREHOUSE_POLICY_VERSION,
      },
      dateRange: null,
      domainStats: {},
      totalApproxBytes: 0,
      totalRecordCount: 0,
      lastImportBatchId: null,
      lastWrittenAt: null,
      retention: {
        mode: 'unlimited_until_quota',
        rollingDays: null,
        maxTotalBytes: WAREHOUSE_SOFT_BYTES,
      },
      codec: 'json',
      notes: [],
    };
  }

  function approxJsonBytes(value) {
    try {
      return JSON.stringify(value).length;
    } catch (e) {
      return 0;
    }
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mapKeys(m) {
    return m && typeof m === 'object' ? Object.keys(m).length : 0;
  }

  function countHealthRecords(data) {
    if (!data || typeof data !== 'object') return 0;
    let n = 0;
    n += (data.cgm && data.cgm.length) || 0;
    n += (data.bloodPressure && data.bloodPressure.length) || 0;
    n += (data.weight && data.weight.length) || 0;
    n += (data.bodyFat && data.bodyFat.length) || 0;
    n += (data.workouts && data.workouts.length) || 0;
    n += (data.ecg && data.ecg.length) || 0;
    n += mapKeys(data.hrv);
    n += mapKeys(data.hrvOvernight);
    n += mapKeys(data.restingHr);
    n += mapKeys(data.walkingHr);
    n += mapKeys(data.steps);
    n += mapKeys(data.sleep);
    n += mapKeys(data.watchDaily);
    return n;
  }

  /**
   * Per-domain record counts + approximate JSON bytes (for UI breakdown).
   * @returns {Record<string, { recordCount: number, approxBytes: number, chunkCount: number }>}
   */
  function buildDomainStats(data) {
    if (!data || typeof data !== 'object') return {};
    /** @type {Record<string, unknown>} */
    const slices = {
      cgm: data.cgm || [],
      bloodPressure: data.bloodPressure || [],
      weight: data.weight || [],
      bodyFat: data.bodyFat || [],
      hrv: data.hrv || {},
      hrvOvernight: data.hrvOvernight || {},
      restingHr: data.restingHr || {},
      walkingHr: data.walkingHr || {},
      steps: data.steps || {},
      sleep: data.sleep || {},
      watchDaily: data.watchDaily || {},
      workouts: data.workouts || [],
      ecg: data.ecg || [],
    };
    /** @type {Record<string, { recordCount: number, approxBytes: number, chunkCount: number }>} */
    const out = {};
    Object.keys(slices).forEach((key) => {
      const slice = slices[key];
      const recordCount = Array.isArray(slice) ? slice.length : mapKeys(slice);
      if (!recordCount) return;
      out[key] = {
        recordCount,
        approxBytes: approxJsonBytes(slice),
        chunkCount: 1,
      };
    });
    return out;
  }

  /**
   * Clear domain chunks but keep consent.granted (user can re-save after next analysis).
   */
  function clearWarehousePayloadKeepConsent() {
    return getWarehouseMeta().then((meta) => {
      const granted = !!(meta.consent && meta.consent.granted);
      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            const names = [];
            if (db.objectStoreNames.contains(STORE_WH_CHUNKS)) names.push(STORE_WH_CHUNKS);
            if (db.objectStoreNames.contains(STORE_WH_META)) names.push(STORE_WH_META);
            if (!names.length) {
              db.close();
              resolve(meta);
              return;
            }
            const tx = db.transaction(names, 'readwrite');
            if (names.indexOf(STORE_WH_CHUNKS) >= 0) {
              tx.objectStore(STORE_WH_CHUNKS).clear();
            }
            const next = Object.assign(defaultWarehouseMeta(), meta, { id: WH_META_ID });
            next.dateRange = null;
            next.domainStats = {};
            next.totalApproxBytes = 0;
            next.totalRecordCount = 0;
            next.lastWrittenAt = null;
            next.notes = granted ? ['payload_cleared_keep_consent'] : [];
            // preserve consent object as-is
            if (names.indexOf(STORE_WH_META) >= 0) {
              tx.objectStore(STORE_WH_META).put(next);
            }
            tx.oncomplete = () => {
              db.close();
              resolve(next);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          })
      );
    });
  }

  function inferDateRange(data) {
    if (!data) return null;
    const dates = [];
    const pushDate = (s) => {
      if (!s) return;
      const d = String(s).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d);
    };
    (data.cgm || []).forEach((p) => pushDate(p && p.datetime));
    (data.bloodPressure || []).forEach((p) => pushDate(p && p.datetime));
    (data.weight || []).forEach((p) => pushDate(p && p.datetime));
    (data.workouts || []).forEach((p) => pushDate(p && (p.start || p.datetime)));
    Object.keys(data.sleep || {}).forEach(pushDate);
    Object.keys(data.hrv || {}).forEach(pushDate);
    Object.keys(data.watchDaily || {}).forEach(pushDate);
    Object.keys(data.steps || {}).forEach(pushDate);
    if (!dates.length) return null;
    dates.sort();
    return { start: dates[0], end: dates[dates.length - 1] };
  }

  function getWarehouseMeta() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_WH_META)) {
            db.close();
            resolve(defaultWarehouseMeta());
            return;
          }
          const tx = db.transaction(STORE_WH_META, 'readonly');
          const req = tx.objectStore(STORE_WH_META).get(WH_META_ID);
          req.onsuccess = () => {
            const row = req.result;
            resolve(row ? Object.assign(defaultWarehouseMeta(), row) : defaultWarehouseMeta());
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

  function putWarehouseMeta(meta) {
    const row = Object.assign(defaultWarehouseMeta(), meta || {}, { id: WH_META_ID });
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          if (!db.objectStoreNames.contains(STORE_WH_META)) {
            db.close();
            reject(new Error('warehouseMeta store missing'));
            return;
          }
          const tx = db.transaction(STORE_WH_META, 'readwrite');
          tx.objectStore(STORE_WH_META).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve(row);
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  function isWarehouseConsentGranted() {
    return getWarehouseMeta().then((m) => !!(m && m.consent && m.consent.granted));
  }

  function grantWarehouseConsent(opts) {
    opts = opts || {};
    return getWarehouseMeta().then((meta) => {
      const now = new Date().toISOString();
      meta.consent = {
        granted: true,
        grantedAt: now,
        revokedAt: null,
        policyVersion: (opts.policyVersion || WAREHOUSE_POLICY_VERSION),
      };
      return putWarehouseMeta(meta);
    });
  }

  /**
   * 关闭授权并清空原始仓（默认行为：关授权即删明细）
   */
  function revokeWarehouseConsent() {
    return clearWarehouseOnly().then(() =>
      getWarehouseMeta().then((meta) => {
        const now = new Date().toISOString();
        meta.consent = {
          granted: false,
          grantedAt: meta.consent && meta.consent.grantedAt ? meta.consent.grantedAt : null,
          revokedAt: now,
          policyVersion: WAREHOUSE_POLICY_VERSION,
        };
        meta.dateRange = null;
        meta.domainStats = {};
        meta.totalApproxBytes = 0;
        meta.totalRecordCount = 0;
        meta.lastImportBatchId = null;
        meta.lastWrittenAt = null;
        return putWarehouseMeta(meta);
      })
    );
  }

  function clearWarehouseOnly() {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const names = [];
          if (db.objectStoreNames.contains(STORE_WH_CHUNKS)) names.push(STORE_WH_CHUNKS);
          if (db.objectStoreNames.contains(STORE_WH_META)) names.push(STORE_WH_META);
          if (!names.length) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction(names, 'readwrite');
          if (names.indexOf(STORE_WH_CHUNKS) >= 0) {
            tx.objectStore(STORE_WH_CHUNKS).clear();
          }
          if (names.indexOf(STORE_WH_META) >= 0) {
            // reset meta to default (no consent)
            tx.objectStore(STORE_WH_META).put(defaultWarehouseMeta());
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

  function monthKeyFromDatetime(dt) {
    const s = String(dt || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(s) ? s : 'unknown';
  }

  function yearKeyFromDatetime(dt) {
    const s = String(dt || '').slice(0, 4);
    return /^\d{4}$/.test(s) ? s : 'unknown';
  }

  function recomputeSplitTotalBytes(split) {
    const monthBytes = (split.months || []).reduce((s, m) => s + (m.approxBytes || 0), 0);
    const bpBytes = (split.bpYears || []).reduce((s, y) => s + (y.approxBytes || 0), 0);
    const weightBytes = (split.weightYears || []).reduce((s, y) => s + (y.approxBytes || 0), 0);
    split.totalBytes = (split.coreBytes || 0) + monthBytes + bpBytes + weightBytes;
    return split.totalBytes;
  }

  /**
   * Reassemble a full HealthData object from an in-memory split result.
   */
  function reassembleFromSplit(split) {
    const payload = clonePlain(split.core);
    payload.cgm = [];
    (split.months || []).forEach((m) => {
      payload.cgm = payload.cgm.concat(m.points || []);
    });
    payload.bloodPressure = [];
    (split.bpYears || []).forEach((y) => {
      payload.bloodPressure = payload.bloodPressure.concat(y.points || []);
    });
    payload.weight = [];
    payload.bodyFat = [];
    (split.weightYears || []).forEach((y) => {
      payload.weight = payload.weight.concat(y.weight || []);
      payload.bodyFat = payload.bodyFat.concat(y.bodyFat || []);
    });
    if (payload.dataAvailability) {
      payload.dataAvailability.hasCgm = payload.cgm.length > 0;
      payload.dataAvailability.hasBloodPressure = payload.bloodPressure.length > 0;
      payload.dataAvailability.hasWeight = payload.weight.length > 0;
      if (payload.bodyFat.length) payload.dataAvailability.hasBodyFat = true;
    }
    return payload;
  }

  /**
   * Split HealthData into core (no cgm / BP / weight) + monthly CGM + yearly BP/weight shards.
   * bodyFat rides with weight year shards.
   * @returns {{ core: object, months: object[], bpYears: object[], weightYears: object[], coreBytes: number, totalBytes: number }}
   */
  function splitHealthDataShards(healthData) {
    const full = clonePlain(healthData);
    const cgm = Array.isArray(full.cgm) ? full.cgm : [];
    const bloodPressure = Array.isArray(full.bloodPressure) ? full.bloodPressure : [];
    const weight = Array.isArray(full.weight) ? full.weight : [];
    const bodyFat = Array.isArray(full.bodyFat) ? full.bodyFat : [];
    full.cgm = [];
    full.bloodPressure = [];
    full.weight = [];
    full.bodyFat = [];

    /** @type {Record<string, object[]>} */
    const byMonth = {};
    cgm.forEach((p) => {
      const m = monthKeyFromDatetime(p && p.datetime);
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(p);
    });
    const months = Object.keys(byMonth)
      .sort()
      .map((month) => ({
        month,
        points: byMonth[month],
        approxBytes: approxJsonBytes(byMonth[month]),
        recordCount: byMonth[month].length,
      }));

    /** @type {Record<string, object[]>} */
    const bpByYear = {};
    bloodPressure.forEach((p) => {
      const y = yearKeyFromDatetime(p && p.datetime);
      if (!bpByYear[y]) bpByYear[y] = [];
      bpByYear[y].push(p);
    });
    const bpYears = Object.keys(bpByYear)
      .sort()
      .map((year) => ({
        year,
        points: bpByYear[year],
        approxBytes: approxJsonBytes(bpByYear[year]),
        recordCount: bpByYear[year].length,
      }));

    /** @type {Record<string, { weight: object[], bodyFat: object[] }>} */
    const weightByYear = {};
    weight.forEach((p) => {
      const y = yearKeyFromDatetime(p && p.datetime);
      if (!weightByYear[y]) weightByYear[y] = { weight: [], bodyFat: [] };
      weightByYear[y].weight.push(p);
    });
    bodyFat.forEach((p) => {
      const y = yearKeyFromDatetime(p && p.datetime);
      if (!weightByYear[y]) weightByYear[y] = { weight: [], bodyFat: [] };
      weightByYear[y].bodyFat.push(p);
    });
    const weightYears = Object.keys(weightByYear)
      .sort()
      .map((year) => {
        const bucket = weightByYear[year];
        const recordCount = (bucket.weight.length || 0) + (bucket.bodyFat.length || 0);
        const payloadSlice = { weight: bucket.weight, bodyFat: bucket.bodyFat };
        return {
          year,
          weight: bucket.weight,
          bodyFat: bucket.bodyFat,
          payload: payloadSlice,
          approxBytes: approxJsonBytes(payloadSlice),
          recordCount,
        };
      });

    const coreBytes = approxJsonBytes(full);
    const split = { core: full, months, bpYears, weightYears, coreBytes, totalBytes: 0 };
    recomputeSplitTotalBytes(split);
    return split;
  }

  /**
   * Drop oldest CGM months until under soft quota. Mutates split result.
   */
  function evictOldestCgmMonths(split) {
    let removedCgm = 0;
    let removedMonths = 0;
    const beforeBytes = split.totalBytes;
    while (split.totalBytes > WAREHOUSE_SOFT_BYTES && split.months.length > 0) {
      // Always keep at least the newest month if possible
      if (split.months.length === 1 && split.months[0].recordCount <= 500) break;
      const oldest = split.months.shift();
      removedCgm += oldest.recordCount || 0;
      removedMonths += 1;
      recomputeSplitTotalBytes(split);
    }
    // Fallback: if still over soft with one fat month, point-trim that month
    if (split.totalBytes > WAREHOUSE_SOFT_BYTES && split.months.length === 1) {
      const m = split.months[0];
      let pts = m.points.slice().sort((a, b) =>
        String(a && a.datetime || '').localeCompare(String(b && b.datetime || ''))
      );
      const otherBytes = split.totalBytes - (m.approxBytes || 0);
      while (approxJsonBytes(pts) + otherBytes > WAREHOUSE_SOFT_BYTES && pts.length > 500) {
        const drop = Math.max(50, Math.floor(pts.length * 0.1));
        removedCgm += drop;
        pts = pts.slice(drop);
      }
      m.points = pts;
      m.recordCount = pts.length;
      m.approxBytes = approxJsonBytes(pts);
      recomputeSplitTotalBytes(split);
    }
    return {
      trimmed: removedCgm > 0,
      removedCgm,
      removedMonths,
      beforeBytes,
      afterBytes: split.totalBytes,
    };
  }

  /**
   * After CGM eviction: drop oldest BP/weight year shards until under soft quota.
   * Mutates split.bpYears / split.weightYears.
   */
  function evictOldestBpWeightYears(split) {
    let removedBp = 0;
    let removedWeight = 0;
    let removedYears = 0;
    const beforeBytes = split.totalBytes;
    if (!split.bpYears) split.bpYears = [];
    if (!split.weightYears) split.weightYears = [];

    while (
      split.totalBytes > WAREHOUSE_SOFT_BYTES &&
      (split.bpYears.length > 0 || split.weightYears.length > 0)
    ) {
      // Keep at least the newest year overall when only one year remains across both domains
      const years = {};
      split.bpYears.forEach((y) => {
        years[y.year] = true;
      });
      split.weightYears.forEach((y) => {
        years[y.year] = true;
      });
      const yearKeys = Object.keys(years).sort();
      if (yearKeys.length <= 1) break;

      const oldestYear = yearKeys[0];
      const bpIdx = split.bpYears.findIndex((y) => y.year === oldestYear);
      const wIdx = split.weightYears.findIndex((y) => y.year === oldestYear);
      if (bpIdx >= 0) {
        const row = split.bpYears.splice(bpIdx, 1)[0];
        removedBp += row.recordCount || 0;
        removedYears += 1;
      } else if (wIdx >= 0) {
        const row = split.weightYears.splice(wIdx, 1)[0];
        removedWeight += (row.weight && row.weight.length) || 0;
        removedWeight += (row.bodyFat && row.bodyFat.length) || 0;
        removedYears += 1;
      } else {
        break;
      }
      // Prefer remove both domains for same year in subsequent iterations
      recomputeSplitTotalBytes(split);
    }
    return {
      trimmed: removedBp > 0 || removedWeight > 0,
      removedBp,
      removedWeight,
      removedYears,
      beforeBytes,
      afterBytes: split.totalBytes,
    };
  }

  /**
   * Run CGM month eviction then optional BP/weight year eviction.
   */
  function applyShardQuotaEviction(split) {
    const cgmEv = evictOldestCgmMonths(split);
    const yearEv = evictOldestBpWeightYears(split);
    return {
      trimmed: !!(cgmEv.trimmed || yearEv.trimmed),
      removedCgm: cgmEv.removedCgm || 0,
      removedMonths: cgmEv.removedMonths || 0,
      removedBp: yearEv.removedBp || 0,
      removedWeight: yearEv.removedWeight || 0,
      removedYears: yearEv.removedYears || 0,
      beforeBytes: cgmEv.beforeBytes,
      afterBytes: split.totalBytes,
    };
  }

  /**
   * Drop oldest CGM samples until under soft quota (legacy helper name for API).
   * Prefer monthly eviction; falls back to point trim inside newest month; then year shards.
   */
  function trimCgmForSoftQuota(healthData) {
    try {
      const split = splitHealthDataShards(healthData);
      const ev = applyShardQuotaEviction(split);
      const payload = reassembleFromSplit(split);
      return {
        payload,
        trimmed: ev.trimmed,
        removedCgm: ev.removedCgm,
        removedMonths: ev.removedMonths,
        removedBp: ev.removedBp,
        removedWeight: ev.removedWeight,
        removedYears: ev.removedYears,
        beforeBytes: ev.beforeBytes,
        afterBytes: approxJsonBytes(payload),
      };
    } catch (e) {
      return {
        payload: healthData,
        trimmed: false,
        removedCgm: 0,
        beforeBytes: 0,
        afterBytes: 0,
        error: String((e && e.message) || e),
      };
    }
  }

  function reassembleFromChunks(allChunks) {
    if (!allChunks || !allChunks.length) return null;
    // Legacy single blob
    const legacy = allChunks.find((c) => c && c.id === WH_CHUNK_HEALTH && c.payload);
    if (legacy) {
      return { data: legacy.payload, legacy: true, chunks: [legacy] };
    }
    const core = allChunks.find((c) => c && (c.id === WH_CHUNK_CORE || c.domain === 'core'));
    if (!core || !core.payload) return null;
    const data = clonePlain(core.payload);

    // CGM: if month shards exist, replace; else keep core.cgm (v1.75-only cores may be empty)
    const cgmChunks = allChunks
      .filter((c) => c && c.domain === WH_DOMAIN_CGM && Array.isArray(c.payload))
      .sort((a, b) => String(a.shard || '').localeCompare(String(b.shard || '')));
    if (cgmChunks.length) {
      data.cgm = [];
      cgmChunks.forEach((c) => {
        data.cgm = data.cgm.concat(c.payload);
      });
    } else if (!Array.isArray(data.cgm)) {
      data.cgm = [];
    }

    // BP year shards (v1.79+). If none, keep core.bloodPressure for backward compat with CGM-only sharding.
    const bpChunks = allChunks
      .filter((c) => c && c.domain === WH_DOMAIN_BP && Array.isArray(c.payload))
      .sort((a, b) => String(a.shard || '').localeCompare(String(b.shard || '')));
    if (bpChunks.length) {
      data.bloodPressure = [];
      bpChunks.forEach((c) => {
        data.bloodPressure = data.bloodPressure.concat(c.payload);
      });
    } else if (!Array.isArray(data.bloodPressure)) {
      data.bloodPressure = [];
    }

    // Weight year shards: payload may be array (weight only) or { weight, bodyFat }
    const weightChunks = allChunks
      .filter((c) => c && c.domain === WH_DOMAIN_WEIGHT && c.payload != null)
      .sort((a, b) => String(a.shard || '').localeCompare(String(b.shard || '')));
    if (weightChunks.length) {
      data.weight = [];
      data.bodyFat = Array.isArray(data.bodyFat) ? [] : [];
      weightChunks.forEach((c) => {
        const p = c.payload;
        if (Array.isArray(p)) {
          data.weight = data.weight.concat(p);
        } else if (p && typeof p === 'object') {
          if (Array.isArray(p.weight)) data.weight = data.weight.concat(p.weight);
          if (Array.isArray(p.bodyFat)) data.bodyFat = data.bodyFat.concat(p.bodyFat);
        }
      });
    } else {
      if (!Array.isArray(data.weight)) data.weight = [];
      if (!Array.isArray(data.bodyFat)) data.bodyFat = [];
    }

    if (data.dataAvailability) {
      data.dataAvailability.hasCgm = (data.cgm && data.cgm.length) > 0;
      data.dataAvailability.hasBloodPressure = (data.bloodPressure && data.bloodPressure.length) > 0;
      data.dataAvailability.hasWeight = (data.weight && data.weight.length) > 0;
      if (data.bodyFat && data.bodyFat.length) data.dataAvailability.hasBodyFat = true;
    }
    return {
      data,
      legacy: false,
      chunks: allChunks,
      core,
      cgmChunks,
      bpChunks,
      weightChunks,
    };
  }

  function listAllWarehouseChunks(db) {
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORE_WH_CHUNKS)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORE_WH_CHUNKS, 'readonly');
      const req = tx.objectStore(STORE_WH_CHUNKS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Persist merged HealthData into warehouse (CGM by month; BP/weight by year).
   * @param {object} healthData
   * @param {{ batchId?: string|null }} [opts]
   * @returns {Promise<{ ok: boolean, reason?: string, meta?: object, approxBytes?: number }>}
   */
  function persistHealthDataWarehouse(healthData, opts) {
    opts = opts || {};
    if (!healthData || typeof healthData !== 'object') {
      return Promise.resolve({ ok: false, reason: 'no_data' });
    }
    return getWarehouseMeta().then((meta) => {
      if (!meta.consent || !meta.consent.granted) {
        return { ok: false, reason: 'no_consent' };
      }
      let split;
      let trimMeta;
      try {
        split = splitHealthDataShards(healthData);
        trimMeta = applyShardQuotaEviction(split);
      } catch (e) {
        return { ok: false, reason: 'clone_failed', message: String((e && e.message) || e) };
      }
      let approxBytes = split.totalBytes;
      if (approxBytes > WAREHOUSE_HARD_BYTES) {
        return {
          ok: false,
          reason: 'quota_hard',
          approxBytes,
          maxBytes: WAREHOUSE_HARD_BYTES,
          trimmedCgm: trimMeta.removedCgm,
        };
      }

      // Reassemble for stats
      const payload = reassembleFromSplit(split);

      const recordCount = countHealthRecords(payload);
      const dateRange = inferDateRange(payload);
      const now = new Date().toISOString();
      const batchId = opts.batchId || null;

      const coreChunk = {
        id: WH_CHUNK_CORE,
        domain: 'core',
        shard: 'full',
        dateStart: dateRange ? dateRange.start : null,
        dateEnd: dateRange ? dateRange.end : null,
        payload: split.core,
        approxBytes: split.coreBytes,
        recordCount: countHealthRecords(
          Object.assign({}, split.core, { cgm: [], bloodPressure: [], weight: [], bodyFat: [] })
        ),
        batchId,
        updatedAt: now,
        codec: 'json',
      };
      const cgmChunks = (split.months || []).map((m) => ({
        id: 'cgm|' + m.month,
        domain: WH_DOMAIN_CGM,
        shard: m.month,
        dateStart: m.month + '-01',
        dateEnd: m.month + '-28',
        payload: m.points,
        approxBytes: m.approxBytes,
        recordCount: m.recordCount,
        batchId,
        updatedAt: now,
        codec: 'json',
      }));
      const bpChunks = (split.bpYears || []).map((y) => ({
        id: 'bloodPressure|' + y.year,
        domain: WH_DOMAIN_BP,
        shard: y.year,
        dateStart: y.year + '-01-01',
        dateEnd: y.year + '-12-31',
        payload: y.points,
        approxBytes: y.approxBytes,
        recordCount: y.recordCount,
        batchId,
        updatedAt: now,
        codec: 'json',
      }));
      const weightChunks = (split.weightYears || []).map((y) => ({
        id: 'weight|' + y.year,
        domain: WH_DOMAIN_WEIGHT,
        shard: y.year,
        dateStart: y.year + '-01-01',
        dateEnd: y.year + '-12-31',
        payload: y.payload || { weight: y.weight || [], bodyFat: y.bodyFat || [] },
        approxBytes: y.approxBytes,
        recordCount: y.recordCount,
        batchId,
        updatedAt: now,
        codec: 'json',
      }));

      meta.dateRange = dateRange;
      meta.domainStats = buildDomainStats(payload);
      // Reflect multi-chunk domains in domainStats.chunkCount
      if (meta.domainStats.cgm && cgmChunks.length) {
        meta.domainStats.cgm.chunkCount = cgmChunks.length;
      }
      if (meta.domainStats.bloodPressure && bpChunks.length) {
        meta.domainStats.bloodPressure.chunkCount = bpChunks.length;
      }
      if (meta.domainStats.weight && weightChunks.length) {
        meta.domainStats.weight.chunkCount = weightChunks.length;
      }
      if (meta.domainStats.bodyFat && weightChunks.length) {
        meta.domainStats.bodyFat.chunkCount = weightChunks.length;
      }
      meta.totalApproxBytes = approxBytes;
      meta.totalRecordCount = recordCount;
      meta.lastImportBatchId = batchId || meta.lastImportBatchId || null;
      meta.lastWrittenAt = now;
      meta.codec = 'json';
      meta.layout = 'sharded-v1';
      meta.cgmMonths = cgmChunks.map((c) => c.shard);
      meta.bpYears = bpChunks.map((c) => c.shard);
      meta.weightYears = weightChunks.map((c) => c.shard);
      if (approxBytes > WAREHOUSE_SOFT_BYTES) {
        meta.notes = ['soft_quota_exceeded'];
      } else if (trimMeta.trimmed) {
        const notes = [];
        if (trimMeta.removedMonths) notes.push('cgm_months_evicted_for_quota');
        if (trimMeta.removedYears) notes.push('bp_weight_years_evicted_for_quota');
        meta.notes = notes.length ? notes : ['shards_evicted_for_quota'];
      } else {
        meta.notes = [];
      }

      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            if (
              !db.objectStoreNames.contains(STORE_WH_CHUNKS) ||
              !db.objectStoreNames.contains(STORE_WH_META)
            ) {
              db.close();
              resolve({ ok: false, reason: 'store_missing' });
              return;
            }
            const tx = db.transaction([STORE_WH_CHUNKS, STORE_WH_META], 'readwrite');
            const store = tx.objectStore(STORE_WH_CHUNKS);
            // Clear previous warehouse chunks then write new set
            store.clear();
            store.put(coreChunk);
            cgmChunks.forEach((c) => store.put(c));
            bpChunks.forEach((c) => store.put(c));
            weightChunks.forEach((c) => store.put(c));
            tx.objectStore(STORE_WH_META).put(Object.assign(defaultWarehouseMeta(), meta, { id: WH_META_ID }));
            tx.oncomplete = () => {
              db.close();
              resolve({
                ok: true,
                meta,
                approxBytes,
                softWarn: approxBytes > WAREHOUSE_SOFT_BYTES,
                trimmedCgm: trimMeta.removedCgm || 0,
                trimmed: !!trimMeta.trimmed,
                removedMonths: trimMeta.removedMonths || 0,
                removedBp: trimMeta.removedBp || 0,
                removedWeight: trimMeta.removedWeight || 0,
                removedYears: trimMeta.removedYears || 0,
                layout: 'sharded-v1',
                cgmMonthCount: cgmChunks.length,
                bpYearCount: bpChunks.length,
                weightYearCount: weightChunks.length,
              });
            };
            tx.onerror = () => {
              db.close();
              const err = tx.error;
              const name = err && err.name;
              if (name === 'QuotaExceededError') {
                resolve({ ok: false, reason: 'quota_exceeded', message: String(err) });
              } else {
                reject(err);
              }
            };
          })
      );
    });
  }

  /**
   * @returns {Promise<{ data: object, meta: object, chunk?: object, chunks?: object[], layout?: string }|null>}
   */
  function loadHealthDataWarehouse() {
    return getWarehouseMeta().then((meta) => {
      if (!meta.consent || !meta.consent.granted) return null;
      return openDb().then((db) =>
        listAllWarehouseChunks(db)
          .then((all) => {
            db.close();
            const assembled = reassembleFromChunks(all);
            if (!assembled || !assembled.data) return null;
            return {
              data: assembled.data,
              meta,
              chunk: assembled.legacy
                ? assembled.chunks[0]
                : assembled.core,
              chunks: assembled.chunks,
              layout: assembled.legacy ? 'legacy-full' : 'sharded-v1',
            };
          })
          .catch((e) => {
            try { db.close(); } catch (err) { /* ignore */ }
            throw e;
          })
      );
    });
  }

  function getWarehouseStatus() {
    return getWarehouseMeta().then((meta) => {
      const granted = !!(meta.consent && meta.consent.granted);
      return {
        granted,
        meta,
        policyVersion: WAREHOUSE_POLICY_VERSION,
        softBytes: WAREHOUSE_SOFT_BYTES,
        hardBytes: WAREHOUSE_HARD_BYTES,
        hasPayload: granted && (meta.totalRecordCount > 0 || meta.totalApproxBytes > 0),
        domainStats: meta.domainStats || {},
        softWarn: !!(meta.totalApproxBytes > WAREHOUSE_SOFT_BYTES),
        layout: meta.layout || null,
        cgmMonths: meta.cgmMonths || [],
        bpYears: meta.bpYears || [],
        weightYears: meta.weightYears || [],
      };
    }).then((status) => {
      if (!status.granted) return status;
      return openDb().then((db) =>
        listAllWarehouseChunks(db)
          .then((all) => {
            db.close();
            const assembled = reassembleFromChunks(all);
            status.hasPayload = !!(assembled && assembled.data);
            let bytes = 0;
            (all || []).forEach((c) => {
              bytes += (c && c.approxBytes) || 0;
            });
            status.approxBytes = bytes || status.meta.totalApproxBytes || 0;
            if (assembled && assembled.data) {
              const stats =
                status.domainStats && Object.keys(status.domainStats).length
                  ? status.domainStats
                  : buildDomainStats(assembled.data);
              status.domainStats = stats;
              status.layout = assembled.legacy ? 'legacy-full' : 'sharded-v1';
              const cgmChunkRows = (all || [])
                .filter((c) => c && c.domain === WH_DOMAIN_CGM)
                .slice()
                .sort((a, b) => String(a.shard || '').localeCompare(String(b.shard || '')));
              status.cgmMonths = cgmChunkRows.map((c) => c.shard).filter(Boolean);
              status.cgmMonthDetails = cgmChunkRows.map((c) => ({
                month: c.shard || '',
                recordCount: c.recordCount != null ? c.recordCount : (Array.isArray(c.payload) ? c.payload.length : 0),
                approxBytes: c.approxBytes || 0,
              }));
              const bpChunkRows = (all || [])
                .filter((c) => c && c.domain === WH_DOMAIN_BP)
                .slice()
                .sort((a, b) => String(a.shard || '').localeCompare(String(b.shard || '')));
              status.bpYears = bpChunkRows.map((c) => c.shard).filter(Boolean);
              status.bpYearDetails = bpChunkRows.map((c) => ({
                year: c.shard || '',
                recordCount: c.recordCount != null ? c.recordCount : (Array.isArray(c.payload) ? c.payload.length : 0),
                approxBytes: c.approxBytes || 0,
              }));
              const weightChunkRows = (all || [])
                .filter((c) => c && c.domain === WH_DOMAIN_WEIGHT)
                .slice()
                .sort((a, b) => String(a.shard || '').localeCompare(String(b.shard || '')));
              status.weightYears = weightChunkRows.map((c) => c.shard).filter(Boolean);
              status.weightYearDetails = weightChunkRows.map((c) => {
                let recordCount = c.recordCount;
                if (recordCount == null) {
                  const p = c.payload;
                  if (Array.isArray(p)) recordCount = p.length;
                  else if (p && typeof p === 'object') {
                    recordCount = ((p.weight && p.weight.length) || 0) + ((p.bodyFat && p.bodyFat.length) || 0);
                  } else recordCount = 0;
                }
                return {
                  year: c.shard || '',
                  recordCount,
                  approxBytes: c.approxBytes || 0,
                };
              });
              status.yearDetails = {
                bloodPressure: status.bpYearDetails,
                weight: status.weightYearDetails,
              };
              status.chunkCount = (all || []).length;
              status.coreBytes = ((all || []).find((c) => c && (c.id === WH_CHUNK_CORE || c.domain === 'core')) || {}).approxBytes || 0;
            } else if (assembled && assembled.legacy) {
              status.cgmMonthDetails = [];
              status.bpYearDetails = [];
              status.weightYearDetails = [];
              status.yearDetails = { bloodPressure: [], weight: [] };
              status.chunkCount = 1;
            }
            status.softWarn = status.approxBytes > WAREHOUSE_SOFT_BYTES;
            return status;
          })
          .catch(() => {
            try { db.close(); } catch (e) { /* ignore */ }
            return status;
          })
      );
    });
  }

  // ---------- Backup crypto (v1.71 optional passphrase AES-GCM) ----------
  const BACKUP_PBKDF2_ITERS = 210000;

  function b64FromBytes(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function bytesFromB64(b64) {
    const bin = atob(String(b64 || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function deriveBackupKey(passphrase, saltBytes) {
    if (!global.crypto || !global.crypto.subtle) {
      return Promise.reject(new Error('webcrypto_unavailable'));
    }
    const enc = new TextEncoder();
    return global.crypto.subtle
      .importKey('raw', enc.encode(String(passphrase || '')), 'PBKDF2', false, ['deriveKey'])
      .then((baseKey) =>
        global.crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: BACKUP_PBKDF2_ITERS,
            hash: 'SHA-256',
          },
          baseKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        )
      );
  }

  function encryptBackupPayload(payloadObj, passphrase) {
    if (!passphrase || String(passphrase).length < 4) {
      return Promise.reject(new Error('passphrase_too_short'));
    }
    const salt = global.crypto.getRandomValues(new Uint8Array(16));
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(payloadObj));
    return deriveBackupKey(passphrase, salt).then((key) =>
      global.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain).then((cipherBuf) => ({
        saltB64: b64FromBytes(salt),
        ivB64: b64FromBytes(iv),
        iterations: BACKUP_PBKDF2_ITERS,
        ciphertextB64: b64FromBytes(cipherBuf),
      }))
    );
  }

  function decryptBackupCipher(cipher, passphrase) {
    if (!cipher || !cipher.ciphertextB64 || !cipher.saltB64 || !cipher.ivB64) {
      return Promise.reject(new Error('invalid_cipher'));
    }
    if (!passphrase) return Promise.reject(new Error('passphrase_required'));
    const salt = bytesFromB64(cipher.saltB64);
    const iv = bytesFromB64(cipher.ivB64);
    const ct = bytesFromB64(cipher.ciphertextB64);
    return deriveBackupKey(passphrase, salt)
      .then((key) => global.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct))
      .then((plainBuf) => {
        const text = new TextDecoder().decode(plainBuf);
        return JSON.parse(text);
      })
      .catch(() => Promise.reject(new Error('decrypt_failed')));
  }

  /**
   * Backup envelope. Optional passphrase → AES-GCM (encryption: passphrase-aes-gcm).
   * @param {{ includeSnapshots?: boolean, includeEvents?: boolean, includeReports?: boolean, includeBatches?: boolean, passphrase?: string }} [opts]
   */
  function exportWarehouseBackup(opts) {
    opts = opts || {};
    return getWarehouseMeta().then(async (meta) => {
      const loaded = await loadHealthDataWarehouse();
      /** @type {any} */
      let domainChunks = [];
      if (loaded && Array.isArray(loaded.chunks) && loaded.chunks.length) {
        domainChunks = loaded.chunks;
      } else if (loaded && loaded.chunk) {
        domainChunks = [loaded.chunk];
      }
      const payload = {
        warehouseMeta: meta,
        domainChunks,
      };
      if (opts.includeSnapshots) {
        try { payload.snapshots = await listSnapshots(); } catch (e) { payload.snapshots = []; }
      }
      if (opts.includeReports) {
        try { payload.weeklyReports = await listWeeklyReports(); } catch (e) { payload.weeklyReports = []; }
      }
      if (opts.includeEvents) {
        try { payload.healthEvents = await listHealthEvents(); } catch (e) { payload.healthEvents = []; }
      }
      if (opts.includeBatches) {
        try { payload.importBatches = await listImportBatches(); } catch (e) { payload.importBatches = []; }
      }

      const base = {
        magic: 'health-analyzer-backup',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        app: { name: 'health-analyzer', dataCenter: 'v1.71' },
      };

      const pass = opts.passphrase != null ? String(opts.passphrase) : '';
      if (pass) {
        const cipher = await encryptBackupPayload(payload, pass);
        return Object.assign({}, base, {
          encryption: 'passphrase-aes-gcm',
          cipher,
        });
      }
      return Object.assign({}, base, {
        encryption: 'none',
        payload,
      });
    });
  }

  /**
   * Apply payload body into IDB (replace warehouse + optional side stores).
   * @param {object} body
   * @param {{ regrantConsent?: boolean }} [opts]
   */
  function applyBackupPayload(body, opts) {
    opts = opts || {};
    if (!body || typeof body !== 'object') {
      return Promise.reject(new Error('missing_payload'));
    }
    const chunks = Array.isArray(body.domainChunks) ? body.domainChunks : [];
    const assembled = reassembleFromChunks(chunks);
    if (!assembled || !assembled.data) {
      return Promise.reject(new Error('backup_missing_health_data'));
    }

    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const names = [STORE_WH_META, STORE_WH_CHUNKS];
          if (body.snapshots && db.objectStoreNames.contains(STORE)) names.push(STORE);
          if (body.weeklyReports && db.objectStoreNames.contains(STORE_REPORTS)) names.push(STORE_REPORTS);
          if (body.healthEvents && db.objectStoreNames.contains(STORE_EVENTS)) names.push(STORE_EVENTS);
          if (body.importBatches && db.objectStoreNames.contains(STORE_IMPORT_BATCHES)) {
            names.push(STORE_IMPORT_BATCHES);
          }
          const unique = names.filter((n, i) => names.indexOf(n) === i && db.objectStoreNames.contains(n));
          const tx = db.transaction(unique, 'readwrite');

          tx.objectStore(STORE_WH_CHUNKS).clear();
          const now = new Date().toISOString();
          // Re-persist via same sharded layout when possible
          const toWrite = [];
          if (assembled.legacy && assembled.chunks[0]) {
            toWrite.push(
              Object.assign({}, assembled.chunks[0], {
                id: WH_CHUNK_HEALTH,
                domain: 'healthData',
                shard: 'full',
                updatedAt: now,
              })
            );
          } else {
            chunks.forEach((c) => {
              if (c && c.id) {
                toWrite.push(Object.assign({}, c, { updatedAt: now }));
              }
            });
          }
          toWrite.forEach((c) => tx.objectStore(STORE_WH_CHUNKS).put(c));

          let meta = Object.assign(defaultWarehouseMeta(), body.warehouseMeta || {}, { id: WH_META_ID });
          if (opts.regrantConsent !== false) {
            meta.consent = {
              granted: true,
              grantedAt: (meta.consent && meta.consent.grantedAt) || now,
              revokedAt: null,
              policyVersion: WAREHOUSE_POLICY_VERSION,
            };
          }
          meta.totalApproxBytes = toWrite.reduce((s, c) => s + (c.approxBytes || 0), 0)
            || approxJsonBytes(assembled.data);
          meta.totalRecordCount = countHealthRecords(assembled.data);
          meta.dateRange = inferDateRange(assembled.data);
          meta.domainStats = buildDomainStats(assembled.data);
          meta.lastWrittenAt = now;
          meta.layout = assembled.legacy ? 'legacy-full' : 'sharded-v1';
          meta.cgmMonths = toWrite
            .filter((c) => c && c.domain === WH_DOMAIN_CGM)
            .map((c) => c.shard)
            .filter(Boolean)
            .sort();
          meta.bpYears = toWrite
            .filter((c) => c && c.domain === WH_DOMAIN_BP)
            .map((c) => c.shard)
            .filter(Boolean)
            .sort();
          meta.weightYears = toWrite
            .filter((c) => c && c.domain === WH_DOMAIN_WEIGHT)
            .map((c) => c.shard)
            .filter(Boolean)
            .sort();
          tx.objectStore(STORE_WH_META).put(meta);

          if (body.snapshots && unique.indexOf(STORE) >= 0) {
            tx.objectStore(STORE).clear();
            (body.snapshots || []).forEach((s) => {
              if (s && s.id) tx.objectStore(STORE).put(s);
            });
          }
          if (body.weeklyReports && unique.indexOf(STORE_REPORTS) >= 0) {
            tx.objectStore(STORE_REPORTS).clear();
            (body.weeklyReports || []).forEach((s) => {
              if (s && s.id) tx.objectStore(STORE_REPORTS).put(s);
            });
          }
          if (body.healthEvents && unique.indexOf(STORE_EVENTS) >= 0) {
            tx.objectStore(STORE_EVENTS).clear();
            (body.healthEvents || []).forEach((s) => {
              if (s && s.id) tx.objectStore(STORE_EVENTS).put(s);
            });
          }
          if (body.importBatches && unique.indexOf(STORE_IMPORT_BATCHES) >= 0) {
            tx.objectStore(STORE_IMPORT_BATCHES).clear();
            (body.importBatches || []).forEach((s) => {
              if (s && s.id) tx.objectStore(STORE_IMPORT_BATCHES).put(s);
            });
          }

          tx.oncomplete = () => {
            db.close();
            resolve({ ok: true, meta });
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        })
    );
  }

  /**
   * Replace warehouse (and optional side stores) from backup.
   * @param {object} envelope
   * @param {{ regrantConsent?: boolean, passphrase?: string }} [opts]
   */
  function importWarehouseBackup(envelope, opts) {
    opts = opts || {};
    if (!envelope || envelope.magic !== 'health-analyzer-backup') {
      return Promise.reject(new Error('invalid_backup_magic'));
    }
    if (Number(envelope.formatVersion) !== 1) {
      return Promise.reject(new Error('unsupported_backup_version'));
    }

    const enc = envelope.encryption || 'none';
    if (enc === 'none') {
      return applyBackupPayload(envelope.payload, opts);
    }
    if (enc === 'passphrase-aes-gcm') {
      return decryptBackupCipher(envelope.cipher, opts.passphrase).then((body) =>
        applyBackupPayload(body, opts)
      );
    }
    return Promise.reject(new Error('unsupported_encryption'));
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
   * 清空全部本机健康历史 store：摘要快照 + 周报历史 + 事件时间线 + 导入批次 + 原始仓
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
          if (db.objectStoreNames.contains(STORE_WH_CHUNKS)) {
            names.push(STORE_WH_CHUNKS);
          }
          if (db.objectStoreNames.contains(STORE_WH_META)) {
            names.push(STORE_WH_META);
          }
          const tx = db.transaction(names, 'readwrite');
          for (const n of names) {
            if (n === STORE_WH_META) {
              tx.objectStore(n).put(defaultWarehouseMeta());
            } else {
              tx.objectStore(n).clear();
            }
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

  function normalizeCgmMonths(months) {
    const out = [];
    const seen = {};
    (Array.isArray(months) ? months : [months]).forEach((raw) => {
      const m = String(raw || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m) && !seen[m]) {
        seen[m] = true;
        out.push(m);
      }
    });
    return out;
  }

  function fillShardYearLists(next, remaining) {
    next.cgmMonths = remaining
      .filter((c) => c && c.domain === WH_DOMAIN_CGM)
      .map((c) => c.shard)
      .filter(Boolean)
      .sort();
    next.bpYears = remaining
      .filter((c) => c && c.domain === WH_DOMAIN_BP)
      .map((c) => c.shard)
      .filter(Boolean)
      .sort();
    next.weightYears = remaining
      .filter((c) => c && c.domain === WH_DOMAIN_WEIGHT)
      .map((c) => c.shard)
      .filter(Boolean)
      .sort();
  }

  function recomputeMetaAfterShardDeletes(meta, remaining, note) {
    const now = new Date().toISOString();
    let next = Object.assign(defaultWarehouseMeta(), meta, { id: WH_META_ID });
    const assembled = reassembleFromChunks(remaining);
    if (assembled && assembled.data) {
      next.totalApproxBytes = remaining.reduce((s, c) => s + (c.approxBytes || 0), 0);
      next.totalRecordCount = countHealthRecords(assembled.data);
      next.dateRange = inferDateRange(assembled.data);
      next.domainStats = buildDomainStats(assembled.data);
      next.layout = assembled.legacy ? 'legacy-full' : 'sharded-v1';
      fillShardYearLists(next, remaining);
    } else {
      const core = remaining.find((c) => c && (c.id === WH_CHUNK_CORE || c.domain === 'core'));
      if (core && core.payload) {
        // Fall back to core-only reassembly without domain shards
        const data = clonePlain(core.payload);
        if (!Array.isArray(data.cgm)) data.cgm = [];
        if (!Array.isArray(data.bloodPressure)) data.bloodPressure = [];
        if (!Array.isArray(data.weight)) data.weight = [];
        if (!Array.isArray(data.bodyFat)) data.bodyFat = [];
        next.totalApproxBytes =
          remaining.reduce((s, c) => s + (c.approxBytes || 0), 0) ||
          core.approxBytes ||
          approxJsonBytes(core.payload);
        next.totalRecordCount = countHealthRecords(data);
        next.dateRange = inferDateRange(data);
        next.domainStats = buildDomainStats(data);
        next.layout = 'sharded-v1';
        fillShardYearLists(next, remaining);
      } else {
        next.totalApproxBytes = 0;
        next.totalRecordCount = 0;
        next.dateRange = null;
        next.domainStats = {};
        next.cgmMonths = [];
        next.bpYears = [];
        next.weightYears = [];
      }
    }
    next.lastWrittenAt = now;
    next.notes = note ? [note] : [];
    return next;
  }

  /** @deprecated use recomputeMetaAfterShardDeletes */
  function recomputeMetaAfterCgmDeletes(meta, remaining, note) {
    return recomputeMetaAfterShardDeletes(meta, remaining, note);
  }

  /**
   * Delete one or more CGM monthly shards (id cgm|YYYY-MM). Recomputes warehouse meta.
   * @param {string|string[]} months e.g. '2026-07' or ['2026-06','2026-07']
   * @returns {Promise<{ ok: boolean, reason?: string, months?: string[], deleted?: string[], meta?: object }>}
   */
  function deleteCgmMonthShards(months) {
    const list = normalizeCgmMonths(months);
    if (!list.length) {
      return Promise.resolve({ ok: false, reason: 'invalid_month' });
    }
    const idSet = {};
    list.forEach((m) => {
      idSet['cgm|' + m] = m;
    });
    return getWarehouseMeta().then((meta) => {
      if (!meta.consent || !meta.consent.granted) {
        return { ok: false, reason: 'no_consent' };
      }
      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(STORE_WH_CHUNKS)) {
              db.close();
              resolve({ ok: false, reason: 'store_missing' });
              return;
            }
            const tx = db.transaction([STORE_WH_CHUNKS, STORE_WH_META], 'readwrite');
            const store = tx.objectStore(STORE_WH_CHUNKS);
            Object.keys(idSet).forEach((id) => store.delete(id));
            const allReq = store.getAll();
            allReq.onsuccess = () => {
              const all = allReq.result || [];
              const remaining = all.filter((c) => c && !idSet[c.id]);
              const deleted = list.slice();
              const note =
                deleted.length === 1
                  ? 'cgm_month_deleted:' + deleted[0]
                  : 'cgm_months_deleted:' + deleted.join(',');
              const next = recomputeMetaAfterCgmDeletes(meta, remaining, note);
              tx.objectStore(STORE_WH_META).put(next);
              tx.oncomplete = () => {
                db.close();
                resolve({
                  ok: true,
                  months: deleted,
                  deleted,
                  meta: next,
                });
              };
            };
            allReq.onerror = () => {
              db.close();
              reject(allReq.error);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          })
      );
    });
  }

  /**
   * Delete one CGM monthly shard (id cgm|YYYY-MM).
   * @param {string} month e.g. '2026-07'
   */
  function deleteCgmMonthShard(month) {
    return deleteCgmMonthShards([month]).then((res) => {
      if (!res || !res.ok) return res;
      return {
        ok: true,
        month: res.months && res.months[0],
        deleted: !!(res.deleted && res.deleted.length),
        meta: res.meta,
      };
    });
  }

  function normalizeYears(years) {
    const out = [];
    const seen = {};
    (Array.isArray(years) ? years : [years]).forEach((raw) => {
      const y = String(raw || '').slice(0, 4);
      if (/^\d{4}$/.test(y) && !seen[y]) {
        seen[y] = true;
        out.push(y);
      }
    });
    return out;
  }

  /**
   * Delete one or more yearly shards for bloodPressure or weight.
   * @param {'bloodPressure'|'weight'} domain
   * @param {string|string[]} years e.g. '2025' or ['2024','2025']
   */
  function deleteDomainYearShards(domain, years) {
    const dom = String(domain || '');
    if (dom !== WH_DOMAIN_BP && dom !== WH_DOMAIN_WEIGHT) {
      return Promise.resolve({ ok: false, reason: 'invalid_domain' });
    }
    const list = normalizeYears(years);
    if (!list.length) {
      return Promise.resolve({ ok: false, reason: 'invalid_year' });
    }
    const idSet = {};
    list.forEach((y) => {
      idSet[dom + '|' + y] = y;
    });
    return getWarehouseMeta().then((meta) => {
      if (!meta.consent || !meta.consent.granted) {
        return { ok: false, reason: 'no_consent' };
      }
      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains(STORE_WH_CHUNKS)) {
              db.close();
              resolve({ ok: false, reason: 'store_missing' });
              return;
            }
            const tx = db.transaction([STORE_WH_CHUNKS, STORE_WH_META], 'readwrite');
            const store = tx.objectStore(STORE_WH_CHUNKS);
            Object.keys(idSet).forEach((id) => store.delete(id));
            const allReq = store.getAll();
            allReq.onsuccess = () => {
              const all = allReq.result || [];
              const remaining = all.filter((c) => c && !idSet[c.id]);
              const deleted = list.slice();
              const note =
                deleted.length === 1
                  ? dom + '_year_deleted:' + deleted[0]
                  : dom + '_years_deleted:' + deleted.join(',');
              const next = recomputeMetaAfterShardDeletes(meta, remaining, note);
              tx.objectStore(STORE_WH_META).put(next);
              tx.oncomplete = () => {
                db.close();
                resolve({
                  ok: true,
                  domain: dom,
                  years: deleted,
                  deleted,
                  meta: next,
                });
              };
            };
            allReq.onerror = () => {
              db.close();
              reject(allReq.error);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          })
      );
    });
  }

  function deleteBloodPressureYearShards(years) {
    return deleteDomainYearShards(WH_DOMAIN_BP, years);
  }

  function deleteWeightYearShards(years) {
    return deleteDomainYearShards(WH_DOMAIN_WEIGHT, years);
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
    // v1.68 原始数据仓（opt-in）
    WAREHOUSE_POLICY_VERSION,
    WAREHOUSE_SOFT_BYTES,
    WAREHOUSE_HARD_BYTES,
    getWarehouseMeta,
    getWarehouseStatus,
    isWarehouseConsentGranted,
    grantWarehouseConsent,
    revokeWarehouseConsent,
    clearWarehouseOnly,
    clearWarehousePayloadKeepConsent,
    deleteCgmMonthShard,
    deleteCgmMonthShards,
    deleteDomainYearShards,
    deleteBloodPressureYearShards,
    deleteWeightYearShards,
    buildDomainStats,
    trimCgmForSoftQuota,
    splitHealthDataShards,
    reassembleFromChunks,
    persistHealthDataWarehouse,
    loadHealthDataWarehouse,
    exportWarehouseBackup,
    importWarehouseBackup,
  };
})(typeof window !== 'undefined' ? window : globalThis);
