import type { DrillLevel } from '@ap/contracts';
import { formatText } from '@ap/kernel';
import { RCC_MESSAGES as M } from './messages';
import { COHORTS, STRUCTURES } from './prototype/comparisonCatalog';
import { comparisonUnits, layerLabel } from './prototype/comparisonUnits';

// Recipe and combined modes share IDs, so use the combined label for those IDs in the path.
const unitLabels = new Map([...comparisonUnits('ppid', {}), ...comparisonUnits('combined', {})]
  .map(({ id, label }) => [id, label]));
const layerLabels = new Map<string, string>(COHORTS.map(cohort => [cohort.id, layerLabel(cohort)]));
const stepsById = new Map(Object.values(STRUCTURES).flat().map(step => [step.id, step]));

export const RCC_FACET_KEYS = { ppid: 'ppidFilter', layer: 'layerFilter', recipe: 'recipeFilter' } as const;
export const RCC_DRILL = {
  levels: [
    { key: 'unit', label: M.cohort, valueLabel: value => unitLabels.get(value) ?? value },
    { key: 'layer', label: M.layer, valueLabel: value => layerLabels.get(value) ?? value },
    { key: 'step', label: M.step, valueLabel: (value, lang) => {
      const step = stepsById.get(value);
      return step ? formatText(M.stepLabel, lang, { no: step.no, seq: step.seq }) : value;
    } },
  ] satisfies DrillLevel[],
  resetKeys: ['equipment'],
};
