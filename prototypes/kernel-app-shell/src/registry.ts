/** 합성 fixture, 실제 메뉴 아님. No business pages are registered here. */
export const FIXTURE_NOTICE = '합성 fixture, 실제 메뉴 아님';
export type Capability = 'apply' | 'reference' | 'unsupported';
export type ContextKey = 'time' | 'room_names' | 'condition' | 'selection' | 'lot' | 'ppid' | 'recipe' | 'metricVersion';
export type MenuEntry = {
  id: string; group: string; name: string; path: string; icon: string;
  fixture: typeof FIXTURE_NOTICE;
  requiredPermissions: readonly string[]; requiredScope: 'single-requested';
  supportedContext: Record<ContextKey, Capability>;
  pageType: 'overview' | 'analysis' | 'management' | 'catalog' | 'workflow';
  features: { export: boolean; savedView: boolean; annotate: boolean; compare: boolean };
};
const unsupported = { time: 'unsupported', room_names: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metricVersion: 'unsupported' } as const;
const base = { group: 'Synthetic fixtures', fixture: FIXTURE_NOTICE, requiredPermissions: ['fixture:inspect'], requiredScope: 'single-requested', features: { export: false, savedView: false, annotate: false, compare: false } } as const;
export const menus: readonly MenuEntry[] = [
  { ...base, id: 'sample-overview', name: 'Sample overview', path: '/sample-overview', icon: '○', pageType: 'overview', supportedContext: { ...unsupported, room_names: 'apply', condition: 'reference', selection: 'unsupported' } },
  { ...base, id: 'sample-analysis', name: 'Sample analysis', path: '/sample-analysis', icon: '◇', pageType: 'analysis', supportedContext: { ...unsupported, room_names: 'apply', condition: 'apply', selection: 'apply' } },
  { ...base, id: 'sample-reference', name: 'Sample reference', path: '/sample-reference', icon: '□', pageType: 'catalog', supportedContext: unsupported },
];
