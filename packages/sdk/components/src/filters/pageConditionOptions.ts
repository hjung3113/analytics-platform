import type { PageConditionCategory, PageConditionGroupedOptionsResponse, PageConditionOption, PageConditionOptionsResponse } from '@ap/contracts';

export type PageConditionOptions = PageConditionOptionsResponse | PageConditionGroupedOptionsResponse;
export type PageConditionOptionsLoader = (category: PageConditionCategory, options: { signal: AbortSignal }) => Promise<PageConditionOptions>;

/** Validate the loader boundary before options become control values. Reject atomically, never prune. */
export function checkPageConditionOptions(category: PageConditionCategory, response: PageConditionOptions): PageConditionOptions {
  const ids = new Set<string>();
  const check = (options: readonly PageConditionOption[]) => {
    if (!Array.isArray(options)) throw new Error('Invalid options list');
    for (const option of options) {
      if (!option || typeof option.value !== 'string' || !option.value.trim() || ids.has(option.value) || !validText(option.label) || (option.disabledReason !== undefined && !validText(option.disabledReason))) throw new Error('Invalid or duplicate option');
      // Option ids must be encodable by the S1 codec, including literal leading tildes.
      encodeURIComponent(option.value);
      ids.add(option.value);
    }
  };
  if (category.kind.type === 'groupedChecks') {
    if (!('groups' in response) || !Array.isArray(response.groups)) throw new Error('Expected grouped options');
    const groupIds = new Set<string>();
    const listIds = new Set(category.kind.lists.map(list => list.id));
    for (const group of response.groups) {
      if (!group || typeof group.id !== 'string' || !group.id.trim() || groupIds.has(group.id) || !validText(group.label) || !group.lists || typeof group.lists !== 'object') throw new Error('Invalid options group');
      groupIds.add(group.id);
      if (Object.keys(group.lists).some(id => !listIds.has(id))) throw new Error('Undeclared options list');
      for (const options of Object.values(group.lists)) check(options);
    }
  } else {
    if (!('options' in response) || (response.truncated !== undefined && typeof response.truncated !== 'boolean')) throw new Error('Expected flat options');
    check(response.options);
  }
  return response;
}
function validText(value: unknown): boolean {
  return !!value && typeof value === 'object' && 'ko' in value && 'en' in value && typeof value.ko === 'string' && !!value.ko.trim() && typeof value.en === 'string' && !!value.en.trim();
}
