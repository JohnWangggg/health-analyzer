import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHealthXml } from './HealthCoreAdapter';
import {
  buildDomainChunkRows,
  reassembleFromSplit,
  splitHealthDataShards,
} from './warehouseShards';
import { reassembleFromChunks } from './warehouseLoad';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  __dirname,
  '../../../../e2e/fixtures/minimal-export.xml',
);

describe('warehouseShards (legacy-compatible split)', () => {
  it('split → reassembleFromSplit preserves CGM/weight counts', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const split = splitHealthDataShards(data);
    expect(split.core.cgm).toEqual([]);
    expect(split.months.length).toBeGreaterThan(0);
    const back = reassembleFromSplit(split);
    expect(back.cgm.length).toBe(data.cgm.length);
    expect(back.weight.length).toBe(data.weight.length);
    expect(back.bloodPressure.length).toBe(data.bloodPressure.length);
  });

  it('chunk rows reassemble via warehouseLoad reassembleFromChunks', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const split = splitHealthDataShards(data);
    const rows = buildDomainChunkRows(split);
    expect(rows.some((r) => r.id === 'core|full')).toBe(true);
    expect(rows.some((r) => r.domain === 'cgm')).toBe(true);

    const assembled = reassembleFromChunks(rows, { metaLayout: 'sharded-v1' });
    expect(assembled).toBeTruthy();
    expect(assembled!.data.cgm.length).toBe(data.cgm.length);
    expect(assembled!.layout).toBe('sharded-v1');
  });

  it('core is thin (no domain arrays left in core payload)', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const split = splitHealthDataShards(data);
    expect(split.core.cgm.length).toBe(0);
    expect(split.core.bloodPressure.length).toBe(0);
    expect(split.core.weight.length).toBe(0);
  });
});
