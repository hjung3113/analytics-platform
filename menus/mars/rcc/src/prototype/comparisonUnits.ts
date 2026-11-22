import type { FacetedSetDialogProps, FacetedSetValue } from '@ap/components';
import { COHORTS, type Cohort } from './comparisonCatalog';

export const MODE_FACETS = {
  ppid: ['ppid'],
  recipe: ['layer', 'recipe'],
  combined: ['ppid', 'layer', 'recipe'],
} as const;
export type ComparisonMode = keyof typeof MODE_FACETS;
export const MODES = Object.keys(MODE_FACETS) as ComparisonMode[];
const ALL_FACETS = MODE_FACETS.combined;

export const layerLabel = (usage: Cohort) => `L${usage.layer}`;
export const usageLabel = (usage: Cohort) => `${usage.ppid} · ${layerLabel(usage)} · ${usage.recipe}`;
const recipeUsageLabel = (usage: Cohort) => `${usage.recipe} · ${usage.ppid} · ${layerLabel(usage)}`;
export const usageFacets = (usage: Cohort) => ({ ppid: usage.ppid, layer: layerLabel(usage), recipe: usage.recipe });
export const FACET_OPTIONS = Object.fromEntries(ALL_FACETS.map(facet => [
  facet, [...new Set(COHORTS.map(usage => usageFacets(usage)[facet]))],
]));

export type ComparisonUnit = { id: string; label: string; usages: readonly Cohort[] };

export function comparisonUnits(mode: ComparisonMode, rule: FacetedSetValue['rule'], usages: readonly Cohort[] = COHORTS): ComparisonUnit[] {
  const filtered = usages.filter(usage => {
    const values = usageFacets(usage);
    return MODE_FACETS[mode].every(facet => !Object.hasOwn(rule, facet) || rule[facet].includes(values[facet]));
  });
  if (mode === 'ppid') {
    const byPpid = new Map<string, Cohort[]>();
    for (const usage of filtered) {
      const group = byPpid.get(usage.ppid);
      if (group) group.push(usage);
      else byPpid.set(usage.ppid, [usage]);
    }
    return [...byPpid].map(([ppid, usages]) => ({ id: ppid, label: ppid, usages }));
  }
  return filtered.map(usage => ({
    id: usage.id, label: mode === 'recipe' ? recipeUsageLabel(usage) : usageLabel(usage), usages: [usage],
  }));
}

export const FACET_RESULTS: Record<ComparisonMode, Pick<FacetedSetDialogProps, 'items' | 'resultColumns'>> = {
  ppid: {
    items: comparisonUnits('ppid', {}).map(unit => ({ id: unit.label, facets: { ppid: unit.id } })),
    resultColumns: [],
  },
  recipe: { items: comparisonUnits('recipe', {}).map(unit => ({ id: unit.label, facets: usageFacets(unit.usages[0]!) })) },
  combined: { items: comparisonUnits('combined', {}).map(unit => ({ id: unit.label, facets: usageFacets(unit.usages[0]!) })) },
};
