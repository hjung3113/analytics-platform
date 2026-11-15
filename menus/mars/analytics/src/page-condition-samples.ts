import { ANALYTICS_MESSAGES } from './messages';
import { pageConditionKeys, type PageConditions } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** Removable #2339 prototype. Only the host's VITE_PAGE_CONDITION_SAMPLES=1 assembly invokes this transform. */
export const PAGE_CONDITION_SAMPLE_SOURCES = [
  { id: 'analytics.productivity.conditionOptions', menuId: 'productivity-overview' },
  { id: 'analytics.catalog.conditionOptions', menuId: 'chart-catalog' },
] as const;
const options = [
  { value: 'syntheticAlpha', label: ANALYTICS_MESSAGES.sampleAlpha },
  { value: 'syntheticBeta', label: ANALYTICS_MESSAGES.sampleBeta },
];
export function withPageConditionSamples(menus: readonly MenuEntry[]): MenuEntry[] {
  return menus.map(menu => {
    const source = PAGE_CONDITION_SAMPLE_SOURCES.find(item => item.menuId === menu.id);
    if (!source) return menu;
    const apply = menu.id === 'productivity-overview';
    const pageConditions: PageConditions = { categories: [
      { id: 'sampleChoice', label: ANALYTICS_MESSAGES.sampleCategory, ...(apply ? { required: true as const } : {}), kind: { type: 'select', key: 'sampleChoice', options: { static: options } } },
      { id: 'sampleMany', label: ANALYTICS_MESSAGES.sampleTargets, kind: { type: 'multi', key: 'sampleMany', options: { static: options } } },
      { id: 'sampleRange', label: ANALYTICS_MESSAGES.sampleAmount, kind: { type: 'range', key: 'sampleRange', min: 0, max: 100, step: 1 } },
      { id: 'sampleDate', label: ANALYTICS_MESSAGES.sampleTime, kind: { type: 'date', from: 'sampleFrom', to: 'sampleTo' } },
      { id: 'sampleChecks', label: ANALYTICS_MESSAGES.sampleGroups, kind: { type: 'groupedChecks', source: source.id, lists: [{ id: 'first', key: 'sampleFirst', label: ANALYTICS_MESSAGES.sampleList }] } },
      { id: 'sampleDisabled', label: ANALYTICS_MESSAGES.sampleDisabled, disabled: { reason: ANALYTICS_MESSAGES.sampleDisabledReason }, kind: { type: 'search', key: 'sampleDisabled' } },
    ], sections: [{ id: 'sampleDetails', label: ANALYTICS_MESSAGES.sampleDetailConditions, categories: ['sampleRange', 'sampleDate', 'sampleChecks', 'sampleDisabled'] }] };
    return { ...menu, pageConditions, pageKeys: [...menu.pageKeys, ...pageConditions.categories.flatMap(pageConditionKeys)], repeatedPageKeys: [...(menu.repeatedPageKeys ?? []), 'sampleMany', 'sampleFirst'], ...(apply ? { query: { mode: 'apply' as const } } : {}) };
  });
}
