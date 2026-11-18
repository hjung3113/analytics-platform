import { TOPVIEW_MESSAGES } from './messages';
import { usePlatform } from '@ap/kernel';
import { usePageKeyRules, type PageKeyRule } from '@ap/components';
import { hostRange, hostWallClock } from './host-props.js';
import type { OptionsState } from './screens/EquipmentBar.js';

/**
 * The page keys both viewer screens reject when malformed (06 §6, ADR-0034): never corrected, never replaced by another object.
 * `rangeFrom`/`rangeTo` are one pair, so each key is valid only when the other is present and the two are an ordered Site Wall-clock
 * pair. `equipment` is checked against the list once it is ready; while the list loads or failed the key passes (the screens' own
 * loading and failed states apply).
 * When Focus's load identity changes, its host clears stale range and cursor keys in an effect; those keys pass for that render so they
 * cannot unmount the host before it clears them.
 */
export function usePageKeyRulesFor(options: OptionsState | null, includeCursor = false, identityChanged = false) {
  const { pageParam, global } = usePlatform();
  const pairOk = () => {
    const from = pageParam('rangeFrom');
    const to = pageParam('rangeTo');
    return from !== null && to !== null && hostRange(from, to).ok;
  };
  const rules: PageKeyRule[] = [
    { key: 'equipment', label: TOPVIEW_MESSAGES.pageKeyRulesEquipment, valid: (raw) => options?.kind !== 'ready' || options.options.some((option) => option.id === raw) },
    { key: 'rangeFrom', label: TOPVIEW_MESSAGES.pageKeyRulesReplayRangeStart, valid: () => identityChanged || pairOk() },
    { key: 'rangeTo', label: TOPVIEW_MESSAGES.pageKeyRulesReplayRangeEnd, valid: () => identityChanged || pairOk() },
  ];
  if (includeCursor) {
    rules.push({
      key: 'cursor', label: TOPVIEW_MESSAGES.pageKeyRulesCursor, valid: (raw) => {
        const cursor = hostWallClock(raw);
        if (cursor === null) return false;
        if (identityChanged || !global.from || !global.to) return true;
        const contextRange = hostRange(global.from, global.to);
        if (!contextRange.ok) return true;
        const pageFrom = pageParam('rangeFrom');
        const pageTo = pageParam('rangeTo');
        let applied = contextRange;
        if (pageFrom !== null || pageTo !== null) {
          if (pageFrom === null || pageTo === null) return true;
          const pageRange = hostRange(pageFrom, pageTo);
          if (!pageRange.ok) return true;
          applied = pageRange;
        }
        return cursor >= applied.from && (cursor < applied.to || (cursor === applied.to && applied.to === contextRange.to));
      },
    });
  }
  return usePageKeyRules(rules);
}
