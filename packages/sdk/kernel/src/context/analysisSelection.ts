import type { AnalysisSelection, AnalysisSelectionShape, AnalysisSelectionUse, Text } from '@ap/contracts';
import { useMemo } from 'react';
import { usePlatform } from '../platform/hooks';
import { menuAnalysisSelections } from '../registry/analysis-selections';
import type { MenuEntry } from '../registry/registry';
import { sameItems, useStable } from '../stable';

/** Maximum distinct values in a URL-backed set (ADR-0175). */
export const ANALYSIS_SELECTION_MAX_VALUES = 50;

const setValues = (values: readonly string[]) => [...new Set(values.filter(value => value !== ''))];
const selectionUrlKey = (key: string) => key;

export function parseAnalysisSelection(shape: AnalysisSelectionShape, values: readonly string[]): AnalysisSelection | null {
  if (shape === 'set') {
    const distinct = setValues(values);
    return distinct.length && distinct.length <= ANALYSIS_SELECTION_MAX_VALUES ? { shape, values: distinct } : null;
  }
  if (values.length !== 1) return null;
  const [from, to, extra] = values[0].split('/');
  return from && to && extra === undefined ? { shape, from, to } : null;
}

export function analysisSelectionParam(selection: AnalysisSelection): string | string[] {
  return selection.shape === 'set' ? setValues(selection.values) : `${selection.from}/${selection.to}`;
}

function sameSelection(a: AnalysisSelection | null, b: AnalysisSelection | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.shape === 'set' && b.shape === 'set') return sameItems(a.values, b.values);
  return a.shape === 'range' && b.shape === 'range' && a.from === b.from && a.to === b.to;
}

const noRoute = { panels: [] };
function useChannels(menu: MenuEntry | undefined) {
  return useMemo(() => menuAnalysisSelections(menu ?? noRoute), [menu]);
}

/** Reads and writes a declared analysis selection through the menu page key (ADR-0175). */
export function useAnalysisSelectionOutput(panelId: string, key: string): {
  selection: AnalysisSelection | null;
  select: (next: AnalysisSelection | null) => boolean;
} {
  const { route, pageParams, setPage } = usePlatform();
  const channel = useChannels(route?.menu).get(key);
  if (route && !channel?.writers.some(writer => writer.panelId === panelId)) {
    throw new RangeError(`Panel "${panelId}" does not declare analysis selection output "${key}"`);
  }
  const urlKey = selectionUrlKey(key);
  const selection = channel ? parseAnalysisSelection(channel.shape, pageParams(urlKey)) : null;
  return { selection, select(next) {
    if (!channel || (next && next.shape !== channel.shape)) return false;
    const param = next ? analysisSelectionParam(next) : [];
    const normalized = parseAnalysisSelection(channel.shape, typeof param === 'string' ? [param] : param);
    if (!normalized && param.length > 0) return false;
    if (sameSelection(selection, normalized)) return true;
    setPage({ [urlKey]: normalized ? param : null });
    return true;
  } };
}

export type AppliedAnalysisSelection = {
  readonly key: string;
  readonly use: AnalysisSelectionUse;
  readonly selection: AnalysisSelection;
  readonly source: { readonly panelId: string; readonly title: Text; readonly dimension: string };
};

/** Reports applied inputs without running queries; queryInputs already reach queries through the page-key path (ADR-0175). */
export function useAnalysisSelectionInputs(panelId: string): { applied: readonly AppliedAnalysisSelection[]; filtered: boolean } {
  const { route, pageParams, session, revision, global } = usePlatform();
  const menu = route?.menu;
  const channels = useChannels(menu);
  if (menu && !menu.panels?.some(panel => panel.id === panelId)) throw new RangeError(`Unknown panel "${panelId}" in menu "${menu.id}"`);
  const applied: AppliedAnalysisSelection[] = [];
  for (const [key, { readers, writers, dimension, shape }] of channels) {
    const inputs = readers.filter(reader => reader.panelId === panelId);
    if (!inputs.length) continue;
    const selection = parseAnalysisSelection(shape, pageParams(selectionUrlKey(key)));
    if (!selection) continue;
    // The URL records the value, so the first declared writer provides the source label.
    const [writer] = writers;
    for (const { use } of inputs) applied.push({ key, use, selection, source: { panelId: writer.panelId, title: writer.title, dimension } });
  }
  const result = { applied, filtered: applied.some(input => input.use === 'filter') };
  return useStable({ menu, panelId, session, revision, scopeId: global.scopeId, result }, (a, b) =>
    a.menu === b.menu && a.panelId === b.panelId && a.session === b.session && a.revision === b.revision && a.scopeId === b.scopeId
    && a.result.applied.length === b.result.applied.length
    && a.result.applied.every((input, i) => {
      const other = b.result.applied[i];
      return input.key === other.key && input.use === other.use && sameSelection(input.selection, other.selection);
    }),
  ).result;
}
