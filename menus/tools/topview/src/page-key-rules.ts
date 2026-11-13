import { usePlatform } from '@ap/kernel';
import { usePageKeyRules, type PageKeyRule } from '@ap/components';
import { hostRange } from './host-props.js';
import type { OptionsState } from './screens/EquipmentBar.js';

/**
 * The page keys both viewer screens reject when malformed (06 §6, ADR-0034): never corrected, never replaced by another object.
 * `rangeFrom`/`rangeTo` are one pair, so each key is valid only when the other is present and the two are an ordered Site Wall-clock
 * pair. `equipment` is checked against the list once it is ready; while the list loads or failed the key passes (the screens' own
 * loading and failed states apply).
 */
export function usePageKeyRulesFor(options: OptionsState | null) {
  const { pageParam } = usePlatform();
  const pairOk = () => {
    const from = pageParam('rangeFrom');
    const to = pageParam('rangeTo');
    return from !== null && to !== null && hostRange(from, to).ok;
  };
  const rules: PageKeyRule[] = [
    { key: 'equipment', label: { ko: '설비', en: 'Equipment' }, valid: (raw) => options?.kind !== 'ready' || options.options.some((option) => option.id === raw) },
    { key: 'rangeFrom', label: { ko: '재생 구간 시작', en: 'Replay range start' }, valid: pairOk },
    { key: 'rangeTo', label: { ko: '재생 구간 끝', en: 'Replay range end' }, valid: pairOk },
  ];
  return usePageKeyRules(rules);
}
