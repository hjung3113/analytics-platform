import { useMemo, useState } from 'react';
import type { MenuViewPanels, PanelInstance } from '@ap/contracts';
import { useSavedViewPanels, type HeldAnalysisSelection, type LentPanelOptions, type SavedViewPanelsOutcome } from '@ap/kernel';
import { HW_TIME_TREND } from '../lentTrendMapping';
import { configurationPanels } from '../panels';

export const HW_TIME_PANEL_ID = 'hw-time-trend';
export const HW_TIME_COMPARISON_ID = 'hw-time-trend-comparison';
const TIME = { key: 'time', dimension: 'wall-clock' } as const;
export const HOLD_TIME = { holdTime: TIME } satisfies LentPanelOptions;

type Comparison = { mode: 'follow' } | { mode: 'hold'; time: HeldAnalysisSelection } | { mode: 'unreadable' };
const following: Comparison = { mode: 'follow' };
const unreadable: Comparison = { mode: 'unreadable' };
const source = { kind: 'declared', panel: HW_TIME_TREND } as const;
const matrixId = configurationPanels.matrix.id;
const timeSource = `${matrixId}.${TIME.key}`;

function savedPanels(comparison: Comparison | null): MenuViewPanels | null {
  if (!comparison || comparison.mode === 'unreadable') return null;
  const matrix: PanelInstance = { id: matrixId, source: { kind: 'declared', panel: matrixId }, inputs: [], outputs: [] };
  const live: PanelInstance = { id: HW_TIME_PANEL_ID, source, inputs: [], outputs: [] };
  const copy: PanelInstance = { ...live, id: HW_TIME_COMPARISON_ID };
  if (comparison.mode === 'hold') {
    const { dimension, selection } = comparison.time;
    // The matrix's applied period is the v1 graph's upstream output. It has no page key.
    matrix.outputs.push({ key: TIME.key, dimension, shape: selection.shape });
    copy.inputs.push({ key: TIME.key, from: timeSource, mode: 'hold', value: selection });
  }
  return { version: 1, instances: [matrix, live, copy] };
}

function restorePanels(outcome: SavedViewPanelsOutcome): Comparison | null {
  if (outcome === 'unreadable') return unreadable;
  const copy = outcome?.instances.find(instance => instance.id === HW_TIME_COMPARISON_ID);
  if (!copy) return null;
  if (copy.source.kind !== 'declared' || copy.source.panel !== HW_TIME_TREND) return unreadable;
  if (copy.inputs.length === 0) return following;
  const [input] = copy.inputs;
  if (copy.inputs.length !== 1 || input?.mode !== 'hold' || input.key !== TIME.key || input.from !== timeSource) return unreadable;
  const matrix = outcome?.instances.find(instance => instance.id === matrixId);
  const output = matrix?.outputs.find(output => output.key === TIME.key);
  if (matrix?.source.kind !== 'declared' || matrix.source.panel !== matrixId || !output) return unreadable;
  return { mode: 'hold', time: { dimension: output.dimension, selection: input.value } };
}

export function useHwTimeComparison(owner: string) {
  const [state, setState] = useState<{ owner: string; comparison: Comparison | null }>({ owner, comparison: null });
  const comparison = state.owner === owner ? state.comparison : null;
  if (state.owner !== owner) setState({ owner, comparison: null });
  const value = useMemo(() => savedPanels(comparison), [comparison]);
  function setComparison(next: Comparison | null) {
    setState(current => current.owner === owner ? { owner, comparison: next } : current);
  }
  useSavedViewPanels({ value, onOpen: outcome => setComparison(restorePanels(outcome)) });
  return {
    comparison,
    hold: (selection: HeldAnalysisSelection['selection']) => setComparison({ mode: 'hold', time: { dimension: TIME.dimension, selection } }),
    follow: () => setComparison(following),
    close: () => setComparison(null),
  };
}
