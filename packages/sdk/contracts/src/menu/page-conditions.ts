import type { Text } from '../i18n.js';
import type { HierarchySource } from './hierarchy.js';

/** Candidate names. Transport ids follow EndpointSpec.id (open menu vocabulary). */
export type EndpointId = string;
export type PageConditionOption = { value: string; label: Text; disabledReason?: Text };
export type PageConditionOptionSource = { static: { value: string; label: Text }[] } | { endpoint: EndpointId };
export type PageConditionCategory = {
  id: string;
  label: Text;
  disabled?: { reason: Text };
  required?: true;
  kind:
    | { type: 'select'; key: string; options: PageConditionOptionSource; default?: string }
    /** `absent: 'all'`: an absent key means every option is checked (the editor shows them checked; the first uncheck subtracts; checking all clears the key). Default: an absent key is `제약 없음` with nothing checked. */
    | { type: 'multi'; key: string; options: PageConditionOptionSource; absent?: 'all' }
    | { type: 'search'; key: string }
    | { type: 'range'; key: string; unit?: Text; min?: number; max?: number; step?: number }
    | { type: 'date'; from: string; to: string }
    | { type: 'groupedChecks'; source: EndpointId; lists: { id: string; key: string; label: Text }[]; absent?: 'all' }
    | { type: 'tree'; key: string; source: EndpointId; value: 'leaves' | 'nodes' };
};
export type PageConditions = {
  categories: PageConditionCategory[];
  sections?: { id: string; label: Text; categories: string[] }[];
};
export type PageConditionOptionsResponse = { options: PageConditionOption[]; truncated?: boolean };
export type PageConditionGroupedOptionsResponse = { groups: { id: string; label: Text; lists: Record<string, PageConditionOption[]> }[] };
/** Tree loading keeps the existing HierarchyPage/HierarchySource protocol. */
export type PageConditionTreeSource = HierarchySource;

/** One source of category key ownership for Registry, codec and summary helpers. */
export function pageConditionKeys(category: PageConditionCategory): string[] {
  const kind = category.kind;
  switch (kind.type) {
    case 'date': return [kind.from, kind.to];
    case 'groupedChecks': return kind.lists.map(list => list.key);
    default: return [kind.key];
  }
}
export function isRepeatedPageCondition(category: PageConditionCategory): boolean {
  return ['multi', 'groupedChecks', 'tree'].includes(category.kind.type);
}
