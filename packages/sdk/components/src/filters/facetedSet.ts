export interface FacetedSetFacet { id: string; label: string; /** Parent facet ID for visual grouping. */ parentId?: string; /** Values without current item membership remain visible at a zero count. */ values?: readonly string[]; /** Selected unresolved values survive all-values normalization. */ preservePicks?: readonly string[]; /** Starts with no values selected; absence still means no filter. */ defaultSelection?: 'all' | 'none' }
export interface FacetedSetItem { id: string; facets: Readonly<Record<string, string | readonly string[]>> }
export interface FacetedSetValue {
  rule: Readonly<Record<string, readonly string[]>>;
  fixed: readonly string[] | null;
}

export function facetValues(value: string | readonly string[] | undefined): readonly string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value : [];
}

export function rulePicks(rule: FacetedSetValue['rule'], facet: string): readonly string[] {
  return Object.hasOwn(rule, facet) ? rule[facet] : [];
}

/** Posting sets deduplicate multi-valued membership; rebuild only when items identity changes. */
export function buildFacetedSetIndex(items: readonly FacetedSetItem[], declaredFacets: readonly FacetedSetFacet[] = []) {
  const facets = new Map<string, Map<string, Set<number>>>();
  const byId = new Map<string, number>();
  const preserved = new Map(declaredFacets.map(facet => [facet.id, new Set(facet.preservePicks ?? [])]));
  for (const { id, values = [] } of declaredFacets) {
    let index = facets.get(id);
    if (!index) { index = new Map(); facets.set(id, index); }
    for (const value of values) if (!index.has(value)) index.set(value, new Set());
  }
  items.forEach((item, index) => {
    byId.set(item.id, index);
    for (const [facet, raw] of Object.entries(item.facets)) {
      let values = facets.get(facet);
      if (!values) { values = new Map(); facets.set(facet, values); }
      for (const value of facetValues(raw)) {
        let members = values.get(value);
        if (!members) { members = new Set(); values.set(value, members); }
        members.add(index);
      }
    }
  });
  return { items, facets, byId, preserved };
}
type FacetedSetIndex = ReturnType<typeof buildFacetedSetIndex>;

export function facetUniverse(index: FacetedSetIndex, rule: FacetedSetValue['rule'], facet: string): readonly string[] {
  return [...new Set([...(index.facets.get(facet)?.keys() ?? []), ...rulePicks(rule, facet)])];
}

/** All is an absent condition; empty picks remain draft-only none. */
export function normalizeFacetedRule(index: FacetedSetIndex, rule: FacetedSetValue['rule']): FacetedSetValue['rule'] {
  return Object.fromEntries(Object.entries(rule).flatMap(([facet, values]) => {
    const picks = new Set(values);
    const preservesPicked = [...(index.preserved.get(facet) ?? [])].some(value => picks.has(value));
    if (picks.size && !preservesPicked && facetUniverse(index, rule, facet).every(value => picks.has(value))) return [];
    return [[facet, [...picks]]];
  }));
}

export function sameFacetedRule(left: FacetedSetValue['rule'], right: FacetedSetValue['rule']): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(facet => {
    if (!Object.hasOwn(right, facet)) return false;
    const picks = new Set(right[facet]);
    return picks.size === left[facet].length && left[facet].every(value => picks.has(value));
  });
}

export function evaluateFacetedSet(index: FacetedSetIndex, rule: FacetedSetValue['rule']) {
  const selected = new Map<string, Set<number>>();
  for (const [facet, picks] of Object.entries(rule)) {
    const members = new Set<number>();
    for (const value of picks) {
      for (const member of index.facets.get(facet)?.get(value) ?? []) members.add(member);
    }
    selected.set(facet, members);
  }
  const failures = new Uint32Array(index.items.length);
  const matches: number[] = [];
  for (let item = 0; item < index.items.length; item++) {
    for (const members of selected.values()) if (!members.has(item)) failures[item]++;
    if (failures[item] === 0) matches.push(item);
  }
  const counts = new Map<string, Map<string, number>>();
  for (const [facet, values] of index.facets) {
    const own = selected.get(facet);
    const valueCounts = new Map<string, number>();
    for (const [value, members] of values) {
      let count = 0;
      for (const item of members) {
        if (failures[item] === 0 || (failures[item] === 1 && own && !own.has(item))) count++;
      }
      valueCounts.set(value, count);
    }
    counts.set(facet, valueCounts);
  }
  return { matches, counts };
}

export function outsideFixedIds(index: FacetedSetIndex, matches: readonly number[], fixed: readonly string[]) {
  const matching = new Set(matches);
  return fixed.filter(id => {
    const item = index.byId.get(id);
    return item === undefined || !matching.has(item);
  });
}
