import type { Capability, ContextKey, EquipmentAxisDescriptor, GlobalContext, Pair } from '@ap/contracts';
import { CONTEXT_LABELS } from '@ap/kernel';
import type { PageFilterSummaryItem } from './PageFilterBar';

export type QuerySummaryOptions = {
  lang: 'ko' | 'en';
  axes?: readonly EquipmentAxisDescriptor[];
  context?: Record<ContextKey, Capability>;
  pageSummary?: readonly PageFilterSummaryItem[];
};
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
/** Consumer metadata includes effective defaults; unknown address keys retain their raw values. */
export function formatQuerySummary(global: GlobalContext, page: readonly Pair[], options: QuerySummaryOptions): string {
  const ko = options.lang === 'ko';
  const values = querySummaryItems(global, options).map(item => `${item.label} ${item.value}${item.capability === 'reference' ? (ko ? ' (참조만)' : ' (Reference only)') : item.capability === 'unsupported' ? (ko ? ' (이 화면에서 미사용)' : ' (Not used on this page)') : ''}`);
  const labels = new Map(options.pageSummary?.map(item => [item.key, item]));
  for (const item of labels.values()) values.push(`${item.label} ${item.value}`);
  for (const [key, value] of page) if (!labels.has(key)) values.push(`${key} ${value}`);
  return values.join(' · ');
}
