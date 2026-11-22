import { RCC_MESSAGES as M } from './messages';

export const RCC_FACET_KEYS = { ppid: 'ppidFilter', layer: 'layerFilter', recipe: 'recipeFilter' } as const;
export const RCC_DRILL = {
  levels: [{ key: 'unit', label: M.cohort }, { key: 'layer', label: M.layer }, { key: 'step', label: M.step }],
  resetKeys: ['equipment'],
};
