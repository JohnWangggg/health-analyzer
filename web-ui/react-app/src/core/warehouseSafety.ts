/**
 * Dual-track warehouse safety.
 *
 * Full shared write uses layout `sharded-v1` via warehouseShards.ts
 * (clear + put domainChunks, same as history-db.js).
 * Legacy simplified core-only write remains force-gated for tests only.
 */
import { WH_LAYOUT_SHARDED } from './warehouseShards';

export const REACT_CORE_FULL_LAYOUT = 'react-core-full-v1';
export const REACT_SHARED_SHARDED_LAYOUT = WH_LAYOUT_SHARDED;

/**
 * Product UI may persist when true (full sharded-v1 writer).
 * core|full-only experimental path still requires force.
 */
export const WAREHOUSE_SHARED_WRITE_ENABLED = true;

/** @deprecated core-only write remains blocked without force */
export function warehouseCoreOnlyWriteBlockedReason(): string {
  return (
    'disabled_core_only_write: use persistHealthDataSharded (sharded-v1). ' +
    'See docs/DUAL_TRACK_UI.md'
  );
}

export function warehouseWriteBlockedReason(): string {
  return warehouseCoreOnlyWriteBlockedReason();
}
