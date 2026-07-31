/**
 * Dual-track warehouse safety flags.
 *
 * P0 (2026-07): Writing simplified `core|full` into a shared DB that may
 * already contain legacy domain shards is unsafe (load merges shards over core).
 * Until a shared full-shard persist module exists, shared writes are disabled
 * in product UI; API returns reason `disabled_until_shared_shard_writer`.
 */
export const REACT_CORE_FULL_LAYOUT = 'react-core-full-v1';

/** Product UI must not call persist on shared warehouse until this is true. */
export const WAREHOUSE_SHARED_WRITE_ENABLED = false;

export function warehouseWriteBlockedReason(): string {
  return (
    'disabled_until_shared_shard_writer: React 简化 core|full 写入会与 legacy ' +
    '分片混读；请在 legacy「数据管理」写入仓，或仅会话内分析。详见 docs/DUAL_TRACK_UI.md'
  );
}
