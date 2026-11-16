export interface FacetedSetFacet { id: string; label: string }
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
export function buildFacetedSetIndex(items: readonly FacetedSetItem[]) {
  const facets = new Map<string, Map<string, Set<number>>>();
  const byId = new Map<string, number>();
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
  return { items, facets, byId };
}
type FacetedSetIndex = ReturnType<typeof buildFacetedSetIndex>;

export function evaluateFacetedSet(index: FacetedSetIndex, rule: FacetedSetValue['rule']) {
  const selected = new Map<string, Set<number>>();
  for (const [facet, picks] of Object.entries(rule)) {
    if (!picks.length) continue;
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
