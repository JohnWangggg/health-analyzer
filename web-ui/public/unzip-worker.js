/**
 * ZIP 选择性解压 Worker（fflate）
 * 主线程传入 Uint8Array + 限额；只 inflate export.xml / 导出.xml / electrocardiograms/*.csv
 */
/* eslint-disable no-restricted-globals */
'use strict';

importScripts('./fflate.min.js');

function decodeZipEntryName(name) {
  const key = String(name || '');
  const bytes = new Uint8Array(key.length);
  for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i) & 0xff;
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    decoded = key;
  }
  if (decoded.includes('\ufffd')) decoded = key;
  return decoded;
}

function isHealthExportXmlName(name) {
  const base = (String(name).split('/').pop() || String(name)).trim();
  if (/export_cda\.xml$/i.test(base)) return false;
  if (/^export\.xml$/i.test(base)) return true;
  if (/导出\.xml$/i.test(base) || /匯出\.xml$/i.test(base)) return true;
  return false;
}

function isEcgCsvPath(name) {
  return /electrocardiograms/i.test(name) && /\.csv$/i.test(name);
}

self.onmessage = function (ev) {
  const msg = ev.data || {};
  if (msg.type !== 'unzip') return;
  try {
    if (typeof fflate === 'undefined' || typeof fflate.unzipSync !== 'function') {
      throw new Error('FFLATE_MISSING');
    }
    const limits = msg.limits || {};
    const u8 = new Uint8Array(msg.buffer);

    let entryCount = 0;
    let selectedInflated = 0;
    let ecgAccepted = 0;
    let ecgSeen = 0;
    let ecgTruncated = false;
    const nameSamples = [];

    const filter = function (file) {
      entryCount += 1;
      if (entryCount > (limits.MAX_CENTRAL_ENTRIES || 80000)) {
        throw new Error('ZIP_TOO_MANY_ENTRIES');
      }
      const rawName = file && file.name != null ? String(file.name) : '';
      const name = decodeZipEntryName(rawName);
      if (nameSamples.length < 12) nameSamples.push(name);

      const originalSize = (file && file.originalSize) || 0;
      const compressedSize = (file && file.size) || 0;

      if (
        originalSize >= (limits.BOMB_MIN_ORIGINAL || 50 * 1024 * 1024) &&
        compressedSize > 0 &&
        originalSize / compressedSize >= (limits.BOMB_RATIO || 80)
      ) {
        throw new Error('ZIP_BOMB');
      }

      if (isHealthExportXmlName(name)) {
        if (originalSize > (limits.MAX_XML_INFLATED || 1200 * 1024 * 1024)) {
          throw new Error('ZIP_XML_TOO_LARGE');
        }
        if (
          selectedInflated + originalSize >
          (limits.MAX_SELECTED_INFLATED || 1400 * 1024 * 1024)
        ) {
          throw new Error('ZIP_INFLATED_TOO_LARGE');
        }
        selectedInflated += originalSize;
        return true;
      }

      if (isEcgCsvPath(name)) {
        ecgSeen += 1;
        if (ecgAccepted >= (limits.MAX_ECG_FILES || 400)) {
          ecgTruncated = true;
          return false;
        }
        if (originalSize > (limits.MAX_SINGLE_ECG_INFLATED || 15 * 1024 * 1024)) {
          return false;
        }
        if (
          selectedInflated + originalSize >
          (limits.MAX_SELECTED_INFLATED || 1400 * 1024 * 1024)
        ) {
          throw new Error('ZIP_INFLATED_TOO_LARGE');
        }
        selectedInflated += originalSize;
        ecgAccepted += 1;
        return true;
      }
      return false;
    };

    const unzipped = fflate.unzipSync(u8, { filter });
    // Transfer file buffers back
    const files = {};
    const transfers = [];
    for (const key of Object.keys(unzipped)) {
      const arr = unzipped[key];
      const buf = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
      files[key] = buf;
      transfers.push(buf);
    }

    self.postMessage(
      {
        type: 'ok',
        files: files,
        meta: {
          entryCount: entryCount,
          selectedInflated: selectedInflated,
          ecgAccepted: ecgAccepted,
          ecgSeen: ecgSeen,
          ecgTruncated: ecgTruncated,
          nameSamples: nameSamples,
        },
      },
      transfers
    );
  } catch (e) {
    self.postMessage({
      type: 'error',
      message: e && e.message ? String(e.message) : String(e),
    });
  }
};
