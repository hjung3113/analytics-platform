import type { AnalysisSelection, AnalysisSelectionUse, Text } from '@ap/contracts';
import { use, useEffect, useInsertionEffect, useMemo, useSyncExternalStore } from 'react';
import { PaneScreenContext, ScreenContext } from '../platform/contexts';
import { usePlatform } from '../platform/hooks';
import type { MenuPlatform } from '../platform/types';
import { menuAnalysisSelections } from '../registry/analysis-selections';
import type { MenuEntry } from '../registry/registry';
import { sameItems, useStable } from '../stable';
import { analysisSelectionParam, parseAnalysisSelection } from './analysisSelectionCodec';
import { isAnalysisSelectionAvailable, readEmptyAvailability, sameAvailability, subscribeToEmptyAvailability, type AnalysisSelectionAvailability } from './analysisSelectionAvailability';

export { ANALYSIS_SELECTION_MAX_VALUES, analysisSelectionParam, parseAnalysisSelection } from './analysisSelectionCodec';

const selectionUrlKey = (key: string) => key;

function sameSelection(a: AnalysisSelection | null, b: AnalysisSelection | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.shape === 'set' && b.shape === 'set') return sameItems(a.values, b.values);
  return a.shape === 'range' && b.shape === 'range' && a.from === b.from && a.to === b.to;
}

const noRoute = { panels: [] };
const useChannels = (menu: MenuEntry | undefined) => useMemo(() => menuAnalysisSelections(menu ?? noRoute), [menu]);
const useWriteScreen = (route: MenuPlatform['route']) => route ? use(PaneScreenContext) ?? use(ScreenContext) : null;

function useReportedAvailability(screen: ReturnType<typeof useWriteScreen>) {
  const store = screen?.analysisSelectionAvailability;
  return useSyncExternalStore(store?.subscribe ?? subscribeToEmptyAvailability, store?.read ?? readEmptyAvailability, readEmptyAvailability);
}

function hasFilterCycle(channels: ReturnType<typeof menuAnalysisSelections>, key: string): boolean {
  const pending = [key];
  const visited = new Set(pending);
  for (const outputKey of pending) {
    const writer = channels.get(outputKey)?.writers[0];
    for (const [inputKey, { readers }] of channels) {
      if (!readers.some(reader => reader.panelId === writer?.panelId && reader.use === 'filter')) continue;
      if (inputKey === key) return true;
      if (visited.has(inputKey)) continue;
      visited.add(inputKey);
      pending.push(inputKey);
    }
  }
  return false;
}

/** Reads and writes a declared analysis selection through the menu page key (ADR-0175). */
export function useAnalysisSelectionOutput(panelId: string, key: string, options?: {
  /** Values present in the source's current data. Omit while availability is unknown. */
  available?: AnalysisSelectionAvailability | undefined;
}): { selection: AnalysisSelection | null; select: (next: AnalysisSelection | null) => boolean } {
  const { route, pageParams, setPage } = usePlatform();
  const screen = useWriteScreen(route);
  const channels = useChannels(route?.menu);
  const channel = channels.get(key);
  const store = screen?.analysisSelectionAvailability;
  const report = useStable(options?.available, sameAvailability);
  const isSource = channel?.writers[0]?.panelId === panelId;
  const canReport = useMemo(() => isSource && !hasFilterCycle(channels, key), [channels, isSource, key]);
  useEffect(() => {
    if (store && canReport && report !== undefined) return store.report(key, report);
  }, [store, canReport, key, report]);
  const urlKey = selectionUrlKey(key);
  if (route && !channel?.writers.some(writer => writer.panelId === panelId)) throw new RangeError(`Panel "${panelId}" does not declare analysis selection output "${key}"`);
  const rendered = pageParams(urlKey);
  const selection = channel ? parseAnalysisSelection(channel.shape, rendered) : null;
  return { selection, select(next) {
    const current = screen?.pageParamsNow(urlKey);
    if (!current || !channel || (next && next.shape !== channel.shape)) return false;
    const param = next && analysisSelectionParam(next);
    const written = typeof param === 'string' ? [param] : param ?? [];
    const normalized = parseAnalysisSelection(channel.shape, written);
    if (!normalized && written.length) return false;
    const holds = (values: readonly string[]) => normalized === null ? values.length === 0 : sameSelection(parseAnalysisSelection(channel.shape, values), normalized);
    // Skip only when both the rendered and the latest proposed address hold it, so a board pane can resend an unaccepted proposal.
    if (holds(current) && holds(rendered)) return true;
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

/** Reports applied inputs without running queries. Panels reading a filter use its value from applied. */
export function useAnalysisSelectionInputs(panelId: string): {
  applied: readonly AppliedAnalysisSelection[];
  filtered: boolean;
  /** Declared input keys whose URL values were discarded. */
  rejected: readonly string[];
  /** Declared input keys whose valid values are absent from the source data. */
  unavailable: readonly string[];
} {
  const { route, pageParams, session, revision, global } = usePlatform();
  const availability = useReportedAvailability(useWriteScreen(route));
  const menu = route?.menu;
  const channels = useChannels(menu);
  if (menu && !menu.panels?.some(panel => panel.id === panelId)) throw new RangeError(`Unknown panel "${panelId}" in menu "${menu.id}"`);
  const applied: AppliedAnalysisSelection[] = [];
  const rejected: string[] = [];
  const unavailable: string[] = [];
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
    if (!isAnalysisSelectionAvailable(selection, availability.get(key))) {
      unavailable.push(key);
      continue;
    }
    const [writer] = writers;
    for (const { use } of inputs) applied.push({ key, use, selection, source: { panelId: writer.panelId, title: writer.title, dimension } });
  }
  const result = { applied, filtered: applied.some(input => input.use === 'filter'), rejected, unavailable };
  return useStable({ menu, panelId, session, revision, scopeId: global.scopeId, result }, (a, b) =>
    a.menu === b.menu && a.panelId === b.panelId && a.session === b.session && a.revision === b.revision && a.scopeId === b.scopeId
    && a.result.applied.length === b.result.applied.length
    && sameItems(a.result.rejected, b.result.rejected)
    && sameItems(a.result.unavailable, b.result.unavailable)
    && a.result.applied.every((input, i) => {
      const other = b.result.applied[i];
      return input.key === other.key && input.use === other.use && sameSelection(input.selection, other.selection);
    }),
  ).result;
}

export type AnalysisSelectionChip = {
  readonly key: string;
  readonly selection: AnalysisSelection;
  readonly dimension: string;
  readonly label: Text | null;
  readonly source: { readonly panelId: string; readonly title: Text };
  readonly after: string | null;
  readonly available: boolean;
};

function orderChips(chips: readonly AnalysisSelectionChip[]): AnalysisSelectionChip[] {
  const waiting = new Map(chips.map(chip => [chip.key, chip]));
  const ordered: AnalysisSelectionChip[] = [];
  while (waiting.size) {
    const remaining = [...waiting.values()];
    const next = remaining.find(chip => chip.after === null || !waiting.has(chip.after));
    if (next) {
      waiting.delete(next.key);
      ordered.push(next);
      continue;
    }
    // A restored URL can contain a cycle of filter inputs: break only the cycle, at its first declared member.
    // Every remaining chip waits on another remaining chip here, so following `after` must revisit a key.
    const seen: string[] = [];
    let key: string | null = remaining[0].key;
    while (key !== null && !seen.includes(key)) {
      seen.push(key);
      key = waiting.get(key)?.after ?? null;
    }
    const cycle = new Set(key === null ? seen : seen.slice(seen.indexOf(key)));
    const root = remaining.find(chip => cycle.has(chip.key)) ?? remaining[0];
    waiting.set(root.key, { ...root, after: null });
  }
  return ordered;
}

/** Models URL-backed analysis selections. onClearCommit runs when a clear passes the navigation guard, before its write (null for clear-all). */
export function useAnalysisSelectionChips(onClearCommit?: (key: string | null) => void): {
  chips: readonly AnalysisSelectionChip[];
  clear: (key: string) => boolean;
  clearAll: () => boolean;
} {
  const { route, pathname, pageParams, session, revision, global } = usePlatform();
  const screen = useWriteScreen(route);
  const availability = useReportedAvailability(screen);
  const menu = route?.menu;
  const paneId = screen?.paneId;
  const scopeId = global.scopeId;
  const channels = useChannels(menu);
  const active: Omit<AnalysisSelectionChip, 'after'>[] = [];
  const parentByPanel = new Map<string, string>();
  for (const [key, { shape, dimension, label, writers, readers }] of channels) {
    const selection = parseAnalysisSelection(shape, pageParams(key));
    if (!selection) continue;
    const [{ panelId, title }] = writers;
    active.push({ key, selection, dimension, label: label ?? null, source: { panelId, title }, available: isAnalysisSelectionAvailable(selection, availability.get(key)) });
    for (const reader of readers) {
      if (reader.use === 'filter' && !parentByPanel.has(reader.panelId)) parentByPanel.set(reader.panelId, key);
    }
  }
  const result = orderChips(active.map(chip => ({ ...chip, after: parentByPanel.get(chip.source.panelId) ?? null })));
  // The address's page values can change without retiring this screen's actions.
  const owner = useMemo(() => ({
    menu, pathname, paneId, session, revision, scopeId,
    clearKeys: null as ((keys: Iterable<string>, key: string | null) => boolean) | null,
  }), [menu, pathname, paneId, session, revision, scopeId]);
  const { chips } = useStable({ owner, chips: result }, (a, b) =>
    a.owner === b.owner
    && a.chips.length === b.chips.length && a.chips.every((chip, i) =>
      chip.key === b.chips[i].key && chip.available === b.chips[i].available && sameSelection(chip.selection, b.chips[i].selection)),
  );

  // Bind the committed screen before descendant layout effects can clear it, as pane address writes do.
  useInsertionEffect(() => {
    if (!screen || !route) return;
    owner.clearKeys = (keys, key) => {
      const patch = new Map<string, null>();
      for (const key of keys) {
        const current = screen.pageParamsNow(key);
        if (!current) return false;
        // A pane can ask again if its parent still renders the value after a clear proposal.
        if (current.length || (screen.screenMode === 'pane' && pageParams(key).length)) patch.set(key, null);
      }
      if (!patch.size) return false;
      screen.setPage(Object.fromEntries(patch), { run: () => {
        if (owner.clearKeys) onClearCommit?.(key);
        return true;
      } });
      return true;
    };
    return () => { owner.clearKeys = null; };
  }, [owner, screen, route, pageParams, onClearCommit]);

  return useMemo(() => ({
    chips,
    clear: (key: string) => channels.has(key) && (owner.clearKeys?.([key], key) ?? false),
    clearAll: () => owner.clearKeys?.(channels.keys(), null) ?? false,
  }), [chips, channels, owner]);
}
