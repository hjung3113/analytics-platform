import type { Capability, ConditionPreset, ContextKey, EquipmentAxisDescriptor, GlobalContext, Pair } from '@ap/contracts';
import { CONTEXT_LABELS } from '@ap/kernel';
import type { PageFilterSummaryItem } from './PageFilterBar';

export type QuerySummaryOptions = {
  lang: 'ko' | 'en';
  axes?: readonly EquipmentAxisDescriptor[];
  context?: Record<ContextKey, Capability>;
  pageSummary?: readonly PageFilterSummaryItem[];
  /** Condition preset the summary is read in (ADR-0083); absent for a menu without presets. */
  preset?: SummaryPreset;
};
/** The preset page key, the declared presets and the one this summary shows (the draft's or the applied one). */
export type SummaryPreset = { key: string; presets: readonly ConditionPreset[]; id: string };
export type QuerySummaryItem = PageFilterSummaryItem & { contextKey: ContextKey; capability?: Capability };
/** Full values stay in DOM text; callers may wrap them but must not drop carried conditions. */
export function querySummaryItems(g: GlobalContext, options: QuerySummaryOptions): QuerySummaryItem[] {
  const { lang, axes = [], context } = options;
  const ko = lang === 'ko';
  const items: QuerySummaryItem[] = [];
  const add = (key: ContextKey, value: string, label = CONTEXT_LABELS[key][lang]) => items.push({ key, contextKey: key, label, value, capability: context?.[key] });
  const ids = (values: readonly string[]) => values.length ? values.join(', ') : ko ? '명시적 빈 선택' : 'Explicit empty selection';
  if (g.from !== null || g.to !== null) add('time', `[${g.from ?? '—'}, ${g.to ?? '—'})`);
  if (g.roomNames !== null) add('roomNames', ids(g.roomNames), ko ? '공정' : 'Process');
  if (g.lineNames !== null) add('line', ids(g.lineNames));
  if (g.prcGroups !== null) add('prcGroup', ids(g.prcGroups));
  if (g.condition) {
    const ordered = [...axes.map(a => a.id), ...Object.keys(g.condition).filter(id => !axes.some(a => a.id === id))];
    for (const id of ordered) if (g.condition[id]) items.push({ key: `condition:${id}`, contextKey: 'condition', label: axes.find(a => a.id === id)?.label[lang] ?? id, value: ids(g.condition[id]), capability: context?.condition });
  }
  if (g.condition !== null || g.prcGroups !== null || g.membershipBasis !== null) items.push({ key: 'membershipBasis', contextKey: 'condition', label: ko ? '소속 기준' : 'Membership', value: g.membershipBasis === 'asOf' ? (ko ? '그 시점 소속' : 'As-of membership') : (ko ? '지금 소속' : 'Current membership') });
  if (g.selection !== null || !context || context.selection === 'apply') add('selection', g.selection === null ? (ko ? '전체 후보' : 'All candidates') : ids(g.selection), 'EquipmentID');
  if (g.lotIds !== null) add('lot', ids(g.lotIds));
  if (g.ppid !== null) add('ppid', g.ppid);
  if (g.recipeIds !== null) add('recipe', ids(g.recipeIds), 'Recipe');
  if (g.metricId !== null || g.metricVersion !== null) add('metric', `${g.metricId ?? '—'} @ ${g.metricVersion ?? '—'}`);
  return items;
}
/** The preset input for a `ConditionPresetView` (Kernel `useConditionPreset()`): `draft` shows the draft preset, `applied` the applied one. */
export function summaryPreset(view: { key: string; presets: readonly ConditionPreset[]; activeId: string; appliedId: string } | null, which: 'draft' | 'applied'): SummaryPreset | undefined {
  return view ? { key: view.key, presets: view.presets, id: which === 'draft' ? view.activeId : view.appliedId } : undefined;
}
/** Equipment axes the preset leaves out of the request: the Condition's non-empty axes the preset's axes do not list. */
export function presetOutsideAxes(global: GlobalContext, preset: SummaryPreset): string[] {
  const axes = preset.presets.find(item => item.id === preset.id)?.axes ?? [];
  return Object.keys(global.condition ?? {}).filter(axis => global.condition?.[axis]?.length && !axes.includes(axis));
}
/** Consumer metadata includes effective defaults; unknown address keys retain their raw values. */
export function formatQuerySummary(global: GlobalContext, page: readonly Pair[], options: QuerySummaryOptions): string {
  const ko = options.lang === 'ko';
  const { preset } = options;
  const active = preset?.presets.find(item => item.id === preset.id);
  // Values the preset leaves out of the request are not part of the query this line describes; the QueryBar still lists them as carried.
  const outside = preset ? presetOutsideAxes(global, preset).map(axis => `condition:${axis}`) : [];
  const values = querySummaryItems(global, options).filter(item => !outside.includes(item.key)).map(item => `${item.label} ${item.value}${item.capability === 'reference' ? (ko ? ' (참조만)' : ' (Reference only)') : item.capability === 'unsupported' ? (ko ? ' (이 화면에서 미사용)' : ' (Not used on this page)') : ''}`);
  const labels = new Map(options.pageSummary?.map(item => [item.key, item]));
  for (const item of labels.values()) values.push(`${item.label} ${item.value}`);
  if (preset && active) values.push(`${ko ? '조건 묶음' : 'Condition set'} ${active.label[options.lang]}`);
  for (const [key, value] of page) if (!labels.has(key) && key !== preset?.key) values.push(`${key} ${value}`);
  return values.join(' · ');
}
