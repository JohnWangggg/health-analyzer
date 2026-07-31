import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardDesc, CardTitle } from '../../components/ui/Card';
import {
  deleteShardIds,
  listDomainShardGroups,
  type DomainShardGroup,
  type ShardListItem,
} from '../../core/warehouseShardDelete';
import { useLocale } from '../../i18n/LocaleProvider';

type Props = {
  onChanged?: () => void;
};

function formatApproxKbNumber(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  return (bytes / 1024).toFixed(1);
}

function kindLabel(kind: DomainShardGroup['kind']): string {
  if (kind === 'cgm-month') return 'cgm-month';
  if (kind === 'year') return 'year';
  return 'other';
}

export function ShardCleanupPanel({ onChanged }: Props) {
  const { t } = useLocale();
  const [groups, setGroups] = useState<DomainShardGroup[] | null>(null);
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const refresh = useCallback(
    async (opts?: { clearStatus?: boolean }) => {
      setBusy(true);
      if (opts?.clearStatus !== false) setStatus(null);
      try {
        const next = await listDomainShardGroups();
        setGroups(next);
        // Drop selections that no longer exist
        const live = new Set(
          next.flatMap((g) => g.items.map((it) => it.id)),
        );
        setSelected((prev) => {
          const out: Record<string, true> = {};
          for (const id of Object.keys(prev)) {
            if (live.has(id) && prev[id]) out[id] = true;
          }
          return out;
        });
      } catch (e) {
        setGroups([]);
        setStatus(
          `${t('data.shards.fail')}: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (on) next[id] = true;
      else delete next[id];
      return next;
    });
    setStatus(null);
  }, []);

  const toggleDomain = useCallback(
    (items: ShardListItem[], on: boolean) => {
      setSelected((prev) => {
        const next = { ...prev };
        for (const it of items) {
          if (on) next[it.id] = true;
          else delete next[it.id];
        }
        return next;
      });
      setStatus(null);
    },
    [],
  );

  const onDelete = useCallback(async () => {
    if (!selectedIds.length) return;
    const ok = window.confirm(
      t('data.shards.confirm').replace('{n}', String(selectedIds.length)),
    );
    if (!ok) return;

    setBusy(true);
    setStatus(t('data.shards.deleting'));
    try {
      const r = await deleteShardIds(selectedIds);
      if (!r.ok) {
        setStatus(`${t('data.shards.fail')}: ${r.reason}`);
        return;
      }
      const deletedN = r.deleted?.length ?? selectedIds.length;
      setSelected({});
      await refresh({ clearStatus: false });
      setStatus(t('data.shards.deleted').replace('{n}', String(deletedN)));
      onChanged?.();
    } catch (e) {
      setStatus(
        `${t('data.shards.fail')}: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [selectedIds, t, refresh, onChanged]);

  const isEmpty = groups != null && groups.length === 0;
  const totalShards =
    groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;

  return (
    <Card className="shard-cleanup-panel" data-testid="shard-cleanup-panel">
      <CardTitle>{t('data.shards.title')}</CardTitle>
      <CardDesc>{t('data.shards.lead')}</CardDesc>
      {groups != null ? (
        <p className="muted" data-testid="shard-total-count">
          {t('data.shards.total').replace('{n}', String(totalShards))}
        </p>
      ) : null}

      <div className="row shard-cleanup-actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          data-testid="shard-list-refresh"
          onClick={() => void refresh()}
        >
          {t('data.shards.refresh')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={busy || selectedIds.length === 0}
          data-testid="shard-delete-selected"
          onClick={() => void onDelete()}
        >
          {busy && selectedIds.length
            ? t('data.shards.deleting')
            : t('data.shards.delete')}
        </Button>
        <span className="muted shard-cleanup-selected" data-testid="shard-selected-count">
          {t('data.shards.selected').replace('{n}', String(selectedIds.length))}
        </span>
      </div>

      {groups == null ? (
        <p className="muted shard-cleanup-empty">{t('data.shards.refresh')}…</p>
      ) : isEmpty ? (
        <p className="muted shard-cleanup-empty" data-testid="shard-cleanup-empty">
          {t('data.shards.empty')}
        </p>
      ) : (
        <div className="shard-cleanup-groups" data-testid="shard-cleanup-groups">
          {groups.map((group) => {
            const allOn = group.items.every((it) => selected[it.id]);
            const someOn = group.items.some((it) => selected[it.id]);
            return (
              <section
                key={group.domain}
                className="shard-cleanup-group"
                data-testid={`shard-domain-${group.domain}`}
              >
                <header className="shard-cleanup-group-head">
                  <label className="shard-cleanup-domain-select">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = someOn && !allOn;
                      }}
                      data-testid={`shard-domain-all-${group.domain}`}
                      onChange={(e) =>
                        toggleDomain(group.items, e.target.checked)
                      }
                    />
                    <span className="shard-cleanup-domain-name">
                      {group.domain}
                    </span>
                  </label>
                  <span className="muted shard-cleanup-kind">
                    {kindLabel(group.kind)} · {group.items.length}
                  </span>
                </header>
                <ul className="shard-cleanup-list">
                  {group.items.map((item) => (
                    <li key={item.id} className="shard-cleanup-item">
                      <label className="shard-cleanup-item-label">
                        <input
                          type="checkbox"
                          data-testid="shard-cb"
                          data-shard-id={item.id}
                          checked={!!selected[item.id]}
                          onChange={(e) => toggle(item.id, e.target.checked)}
                        />
                        <span className="shard-cleanup-shard">{item.shard}</span>
                        <span className="muted shard-cleanup-bytes">
                          {t('data.shards.bytes').replace(
                            '{kb}',
                            formatApproxKbNumber(item.approxBytes),
                          )}
                        </span>
                        {item.recordCount > 0 ? (
                          <span className="muted shard-cleanup-records">
                            n={item.recordCount}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="muted shard-cleanup-total">
            {totalShards} shards · {groups.length} domains
          </p>
        </div>
      )}

      {status ? (
        <p className="muted shard-cleanup-status" data-testid="shard-cleanup-status">
          {status}
        </p>
      ) : null}
    </Card>
  );
}
