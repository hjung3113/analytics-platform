import { useMemo } from 'react';
import type { CustomGroupTarget, SavedViewListItem } from '@ap/contracts';
import { customGroupItemId, customGroupReadState, useMessages } from '@ap/kernel';
import { useCustomGroupList, useHostPlatform } from '@ap/kernel/host';
import { SHELL_MESSAGES } from '../messages';

export type GroupOption = { id: string; label: string; target?: CustomGroupTarget; reason?: string; reasonWord?: string };
export type BlockedGroup = { id: string; reason: string };
export type CustomGroupOptions = {
  optionsById: ReadonlyMap<string, GroupOption>;
  /** Applied groups the query will refuse, with their short reason word; never while the list loads or when Condition is not applied. */
  blocked: readonly BlockedGroup[];
  /** Adds or replaces a group the user just saved, without reloading the list. */
  remember(entry: SavedViewListItem): void;
};

/** A blocked group's reason code → its short word; the code itself stays in the query's technical detail. */
const GROUP_REASON_WORD = {
  'not-found': 'targetGroupReasonNotFound', forbidden: 'targetGroupReasonForbidden', 'scope-mismatch': 'targetGroupReasonScope',
  loading: 'targetGroupReasonLoading', unavailable: 'targetGroupReasonUnavailable', 'store-unavailable': 'targetGroupReasonNoStore',
} as const satisfies Record<string, keyof typeof SHELL_MESSAGES>;

/**
 * Resolves the chosen custom groups against the user's saved groups (ADR-0164). The query bar owns it, so the blocked result lives as
 * long as the bar does and not as long as the folding editor; the target picker reads the same result. A result loaded for another
 * session or Scope counts as loading until the new list arrives.
 */
export function useCustomGroupOptions({ scopeId, selectedGroupIds, canEditCondition }: { scopeId: string | null; selectedGroupIds: readonly string[]; canEditCondition: boolean }): CustomGroupOptions {
  const { savedViewStore } = useHostPlatform();
  const m = useMessages(SHELL_MESSAGES);
  const current = useCustomGroupList(scopeId, canEditCondition);
  const { remember } = current;
  const optionsById = useMemo(() => {
    const result = new Map<string, GroupOption>();
    const blocked = (id: string, reason: string): GroupOption => {
      const reasonWord = m(Object.hasOwn(GROUP_REASON_WORD, reason) ? GROUP_REASON_WORD[reason as keyof typeof GROUP_REASON_WORD] : 'targetGroupReasonOther');
      return { id, label: m('targetGroupMissing', { id, reason: reasonWord }), reason, reasonWord };
    };
    for (const item of current.items) {
      const id = customGroupItemId(item);
      const state = customGroupReadState(item, scopeId);
      if (!('denied' in state)) result.set(id, { id, label: state.name, target: state.target });
      else if (selectedGroupIds.includes(id)) result.set(id, blocked(id, state.denied));
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
  return useMemo(() => ({ optionsById, blocked, remember }), [optionsById, blocked, remember]);
}
