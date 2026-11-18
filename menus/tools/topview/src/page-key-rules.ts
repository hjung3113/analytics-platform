import { TOPVIEW_MESSAGES } from './messages';
import { usePlatform } from '@ap/kernel';
import { usePageKeyRules, type PageKeyRule } from '@ap/components';
import { siteWallClockSchema } from '@eqv/core';
import { hostRange } from './host-props.js';
import type { OptionsState } from './screens/EquipmentBar.js';

/**
 * The page keys both viewer screens reject when malformed (06 §6, ADR-0034): never corrected, never replaced by another object.
 * `rangeFrom`/`rangeTo` are one pair, so each key is valid only when the other is present and the two are an ordered Site Wall-clock
 * pair. `equipment` is checked against the list once it is ready; while the list loads or failed the key passes (the screens' own
 * loading and failed states apply).
 */
export function usePageKeyRulesFor(options: OptionsState | null, includeCursor = false) {
  const { pageParam, global } = usePlatform();
  const pairOk = () => {
    const from = pageParam('rangeFrom');
    const to = pageParam('rangeTo');
    return from !== null && to !== null && hostRange(from, to).ok;
  };
  const rules: PageKeyRule[] = [
    { key: 'equipment', label: TOPVIEW_MESSAGES.pageKeyRulesEquipment, valid: (raw) => options?.kind !== 'ready' || options.options.some((option) => option.id === raw) },
    { key: 'rangeFrom', label: TOPVIEW_MESSAGES.pageKeyRulesReplayRangeStart, valid: pairOk },
    { key: 'rangeTo', label: TOPVIEW_MESSAGES.pageKeyRulesReplayRangeEnd, valid: pairOk },
  ];
  if (includeCursor) {
    rules.push({
      key: 'cursor', label: TOPVIEW_MESSAGES.pageKeyRulesCursor, valid: (raw) => {
        const parsed = siteWallClockSchema.safeParse(raw);
        if (!parsed.success || !global.from || !global.to) return false;
        const pageFrom = pageParam('rangeFrom');
        const pageTo = pageParam('rangeTo');
        let applied;
        if (pageFrom === null && pageTo === null) applied = hostRange(global.from, global.to);
        else if (pageFrom !== null && pageTo !== null) applied = hostRange(pageFrom, pageTo);
        else return false;
        if (!applied.ok) return false;
        const contextEnd = hostRange(global.from, global.to);
        const cursor = parsed.data;
        return cursor >= applied.from && (cursor < applied.to || (cursor === applied.to && contextEnd.ok && applied.to === contextEnd.to));
      },
    });
  }
  return usePageKeyRules(rules);
}
