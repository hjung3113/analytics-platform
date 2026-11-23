import type { AnalysisSelection, AnalysisSelectionUse, Text } from '@ap/contracts';
import { useMemo } from 'react';
import { useHostPlatform, usePlatform } from '../platform/hooks';
import { menuAnalysisSelections } from '../registry/analysis-selections';
import type { MenuEntry } from '../registry/registry';
import { sameItems, useStable } from '../stable';
import { analysisSelectionParam, parseAnalysisSelection } from './analysisSelectionCodec';

export { ANALYSIS_SELECTION_MAX_VALUES, analysisSelectionParam, parseAnalysisSelection } from './analysisSelectionCodec';

const selectionUrlKey = (key: string) => key;

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
  const { route, pageParams, setPage, location, pathname, screenMode } = useHostPlatform();
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
    let currentValues = pageParams(urlKey);
    if (screenMode === 'main') {
      // The location is updated synchronously, including writes from another panel before React renders.
      const address = location.read();
      const queryStart = address?.indexOf('?') ?? -1;
      const path = queryStart === -1 ? address : address?.slice(0, queryStart);
      if (address === null || path !== pathname) return false;
      currentValues = queryStart === -1 ? [] : new URLSearchParams(address.slice(queryStart)).getAll(urlKey);
    }
    if (normalized === null ? currentValues.length === 0 : sameSelection(parseAnalysisSelection(channel.shape, currentValues), normalized)) return true;
    setPage({ [urlKey]: normalized ? param : null });
    return true;
  } };
}

export type AppliedAnalysisSelection = {
  readonly key: string;
  readonly use: AnalysisSelectionUse;
  readonly selection: AnalysisSelection;
  /** First declared writer for this key, so the source is deterministic on shared links and Back. */
  readonly source: { readonly panelId: string; readonly title: Text; readonly dimension: string };
};

/** Reports applied inputs without running queries; queryInputs already reach queries through the page-key path (ADR-0175). */
export function useAnalysisSelectionInputs(panelId: string): {
  applied: readonly AppliedAnalysisSelection[];
  filtered: boolean;
  /** Declared input keys whose URL values were discarded. */
  rejected: readonly string[];
} {
  const { route, pageParams, session, revision, global } = usePlatform();
  const menu = route?.menu;
  const channels = useChannels(menu);
  if (menu && !menu.panels?.some(panel => panel.id === panelId)) throw new RangeError(`Unknown panel "${panelId}" in menu "${menu.id}"`);
  const applied: AppliedAnalysisSelection[] = [];
  const rejected: string[] = [];
  for (const [key, { readers, writers, dimension, shape }] of channels) {
    const inputs = readers.filter(reader => reader.panelId === panelId);
    if (!inputs.length) continue;
    const values = pageParams(selectionUrlKey(key));
    if (!values.length) continue;
    const selection = parseAnalysisSelection(shape, values);
    if (!selection) {
      rejected.push(key);
      continue;
    }
    const [writer] = writers;
    for (const { use } of inputs) applied.push({ key, use, selection, source: { panelId: writer.panelId, title: writer.title, dimension } });
  }
  const result = { applied, filtered: applied.some(input => input.use === 'filter'), rejected };
  return useStable({ menu, panelId, session, revision, scopeId: global.scopeId, result }, (a, b) =>
    a.menu === b.menu && a.panelId === b.panelId && a.session === b.session && a.revision === b.revision && a.scopeId === b.scopeId
    && a.result.applied.length === b.result.applied.length
    && sameItems(a.result.rejected, b.result.rejected)
    && a.result.applied.every((input, i) => {
      const other = b.result.applied[i];
      return input.key === other.key && input.use === other.use && sameSelection(input.selection, other.selection);
    }),
  ).result;
}
