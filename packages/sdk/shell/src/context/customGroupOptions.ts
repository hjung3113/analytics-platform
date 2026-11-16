import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomGroupTarget, SavedViewListItem } from '@ap/contracts';
import { useMessages } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { SHELL_MESSAGES } from '../messages';
import { useSessionKey } from '../frame/sessionKey';

export type GroupOption = { id: string; label: string; target?: CustomGroupTarget; reason?: string; reasonWord?: string };
export type BlockedGroup = { id: string; reason: string };
export type CustomGroupOptions = {
  optionsById: ReadonlyMap<string, GroupOption>;
  /** Applied groups the query will refuse, with their short reason word; never while the list loads or when Condition is not applied. */
  blocked: readonly BlockedGroup[];
  /** Adds or replaces a group the user just saved, without reloading the list. */
  remember(entry: SavedViewListItem): void;
};
type GroupListState = { status: 'loading' | 'ready' | 'error'; key: string | null; items: readonly SavedViewListItem[] };

/** A blocked group's reason code → its short word; the code itself stays in the query's technical detail. */
const GROUP_REASON_WORD = {
  'not-found': 'targetGroupReasonNotFound', forbidden: 'targetGroupReasonForbidden', 'scope-mismatch': 'targetGroupReasonScope',
  loading: 'targetGroupReasonLoading', unavailable: 'targetGroupReasonUnavailable', 'store-unavailable': 'targetGroupReasonNoStore',
} as const satisfies Record<string, keyof typeof SHELL_MESSAGES>;

function savedGroupItemId(item: SavedViewListItem): string {
  return 'denied' in item && item.denied ? item.id : item.view.id;
}

/**
 * Resolves the chosen custom groups against the user's saved groups (ADR-0164). The query bar owns it, so the blocked result lives as
 * long as the bar does and not as long as the folding editor; the target picker reads the same result. A result loaded for another
 * session or Scope counts as loading until the new list arrives.
 */
export function useCustomGroupOptions({ scopeId, selectedGroupIds, canEditCondition }: { scopeId: string | null; selectedGroupIds: readonly string[]; canEditCondition: boolean }): CustomGroupOptions {
  const { savedViewStore, session } = useHostPlatform();
  const sessionKey = useSessionKey();
  const m = useMessages(SHELL_MESSAGES);
  const listKey = JSON.stringify([sessionKey, scopeId, canEditCondition]);
  const [groupList, setGroupList] = useState<GroupListState>({ status: 'loading', key: null, items: [] });
  useEffect(() => {
    if (!canEditCondition || !savedViewStore || !scopeId) {
      setGroupList({ status: 'ready', key: listKey, items: [] });
      return;
    }
    let live = true;
    setGroupList({ status: 'loading', key: listKey, items: [] });
    savedViewStore.list({ userId: session.user.id, menuId: null, kind: 'custom-group' }).then(
      items => { if (live) setGroupList({ status: 'ready', key: listKey, items }); },
      () => { if (live) setGroupList({ status: 'error', key: listKey, items: [] }); },
    );
    return () => { live = false; };
  }, [canEditCondition, savedViewStore, session, scopeId, listKey]);

  const current = useMemo(() => groupList.key === listKey ? groupList : { status: 'loading' as const, key: listKey, items: [] }, [groupList, listKey]);
  const optionsById = useMemo(() => {
    const result = new Map<string, GroupOption>();
    const blocked = (id: string, reason: string): GroupOption => {
      const reasonWord = m(Object.hasOwn(GROUP_REASON_WORD, reason) ? GROUP_REASON_WORD[reason as keyof typeof GROUP_REASON_WORD] : 'targetGroupReasonOther');
      return { id, label: m('targetGroupMissing', { id, reason: reasonWord }), reason, reasonWord };
    };
    for (const item of current.items) {
      const id = savedGroupItemId(item);
      if ('denied' in item && item.denied) {
        if (selectedGroupIds.includes(id)) result.set(id, blocked(id, item.reason));
        continue;
      }
      if (item.view.kind !== 'custom-group') continue;
      if (!item.capabilities.canView) {
        if (selectedGroupIds.includes(id)) result.set(id, blocked(id, item.capabilities.reason ?? 'forbidden'));
        continue;
      }
      if (item.view.savedScopeId !== scopeId) {
        if (selectedGroupIds.includes(id)) result.set(id, blocked(id, 'scope-mismatch'));
        continue;
      }
      result.set(id, { id, label: item.view.name, target: item.view.target });
    }
    for (const id of selectedGroupIds) if (!result.has(id)) {
      const reason = current.status === 'loading' ? 'loading' : current.status === 'error' ? 'unavailable' : savedViewStore ? 'not-found' : 'store-unavailable';
      result.set(id, blocked(id, reason));
    }
    return result;
  }, [current, selectedGroupIds, scopeId, savedViewStore, m]);
  // A Condition the menu does not apply is carried, never queried: its groups block nothing (kernel.md §Context capabilities).
  const blockedKey = JSON.stringify(canEditCondition ? selectedGroupIds.flatMap(id => {
    const option = optionsById.get(id);
    return option?.reasonWord && option.reason !== 'loading' ? [{ id, reason: option.reasonWord }] : [];
  }) : []);
  const blocked = useMemo(() => JSON.parse(blockedKey) as BlockedGroup[], [blockedKey]);
  const remember = useCallback((entry: SavedViewListItem) => setGroupList(previous => ({
    status: 'ready', key: listKey,
    items: [...(previous.key === listKey ? previous.items : []).filter(item => savedGroupItemId(item) !== savedGroupItemId(entry)), entry],
  })), [listKey]);
  return useMemo(() => ({ optionsById, blocked, remember }), [optionsById, blocked, remember]);
}
