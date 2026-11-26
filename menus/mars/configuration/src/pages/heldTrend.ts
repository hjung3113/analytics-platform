import { useMemo, useState } from 'react';
import { panelOutputRef, type MenuViewPanels, type PanelInstance } from '@ap/contracts';
import { useSavedViewPanels, type HeldAnalysisSelection, type LentPanelOptions, type SavedViewPanelsOutcome } from '@ap/kernel';
import { HW_TIME_TREND } from '../lentTrendMapping';
import { configurationPanels } from '../panels';

export const HW_TIME_PANEL_ID = 'hw-time-trend';
export const HW_TIME_COMPARISON_ID = 'hw-time-trend-comparison';
const TIME = { key: 'time', dimension: 'wall-clock' } as const;
export const COMPARISON_OPTIONS = { holdTime: TIME, disablePageOutputs: true } satisfies LentPanelOptions;

type Comparison = { mode: 'follow' } | { mode: 'hold'; time: HeldAnalysisSelection } | { mode: 'unreadable' };
// Legacy views derive the original slot from the page keys. A graph owns the slot independently of its URL target.
type HwTimePanels = { original: 'page' | 'open' | 'closed'; comparison: Comparison | null };
const pagePanels: HwTimePanels = { original: 'page', comparison: null };
const following: Comparison = { mode: 'follow' };
const unreadable: Comparison = { mode: 'unreadable' };
const source = { kind: 'declared', panel: HW_TIME_TREND } as const;
const matrixId = configurationPanels.matrix.id;
const timeSource = panelOutputRef(matrixId, TIME.key);

function savedPanels({ original, comparison }: HwTimePanels, { originalOpen }: { originalOpen: boolean }): MenuViewPanels | null {
  if (comparison?.mode === 'unreadable' || (comparison === null && original === 'page')) return null;
  const matrix: PanelInstance = { id: matrixId, source: { kind: 'declared', panel: matrixId }, inputs: [], outputs: [] };
  const instances = [matrix];
  if (originalOpen) instances.push({ id: HW_TIME_PANEL_ID, source, inputs: [], outputs: [] });
  if (!comparison) return { version: 1, instances };
  const copy: PanelInstance = { id: HW_TIME_COMPARISON_ID, source, inputs: [], outputs: [] };
  if (comparison.mode === 'hold') {
    const { dimension, selection } = comparison.time;
    // The matrix's applied period is the v1 graph's upstream output. It has no page key.
    matrix.outputs.push({ key: TIME.key, dimension, shape: selection.shape });
    copy.inputs.push({ key: TIME.key, from: timeSource, mode: 'hold', value: selection });
  }
  instances.push(copy);
  return { version: 1, instances };
}

function restoreComparison(instances: MenuViewPanels['instances']): Comparison | null {
  const copy = instances.find(instance => instance.id === HW_TIME_COMPARISON_ID);
  if (!copy) return null;
  if (copy.source.kind !== 'declared' || copy.source.panel !== HW_TIME_TREND) return unreadable;
  if (copy.inputs.length === 0) return following;
  const [input] = copy.inputs;
  if (copy.inputs.length !== 1 || input?.mode !== 'hold' || input.key !== TIME.key || input.from !== timeSource) return unreadable;
  const matrix = instances.find(instance => instance.id === matrixId);
  const output = matrix?.outputs.find(output => output.key === TIME.key);
  if (matrix?.source.kind !== 'declared' || matrix.source.panel !== matrixId || !output) return unreadable;
  return { mode: 'hold', time: { dimension: output.dimension, selection: input.value } };
}

function restorePanels(outcome: SavedViewPanelsOutcome): HwTimePanels {
  if (outcome === null) return pagePanels;
  if (outcome === 'unreadable') return { ...pagePanels, comparison: unreadable };
  const original = outcome.instances.some(instance => instance.id === HW_TIME_PANEL_ID
    && instance.source.kind === 'declared' && instance.source.panel === HW_TIME_TREND);
  return { original: original ? 'open' : 'closed', comparison: restoreComparison(outcome.instances) };
}

export function useHwTimePanels(owner: string, { pageHasOriginal }: { pageHasOriginal: boolean }) {
  const [state, setState] = useState({ owner, panels: pagePanels });
  const panels = state.owner === owner ? state.panels : pagePanels;
  if (state.owner !== owner) setState({ owner, panels: pagePanels });
  const originalOpen = panels.original === 'open' || (panels.original === 'page' && pageHasOriginal);
  const value = useMemo(() => savedPanels(panels, { originalOpen }), [panels, originalOpen]);
  function update(edit: (current: HwTimePanels) => HwTimePanels) {
    setState(current => {
      if (current.owner !== owner) return current;
      const next = edit(current.panels);
      return next === current.panels ? current : { owner, panels: next };
    });
  }
  useSavedViewPanels({ value, onOpen: outcome => update(() => restorePanels(outcome)) });
  return {
    originalOpen,
    comparison: panels.comparison,
    openOriginal: () => update(current => current.comparison ? { ...current, original: 'open' } : pagePanels),
    closeOriginal: () => update(current => current.comparison ? { ...current, original: 'closed' } : pagePanels),
    hold: (selection: HeldAnalysisSelection['selection']) => update(() => ({
      original: 'open', comparison: { mode: 'hold', time: { dimension: TIME.dimension, selection } },
    })),
    follow: () => update(current => ({ ...current, comparison: following })),
    closeComparison: () => update(() => pagePanels),
  };
}
