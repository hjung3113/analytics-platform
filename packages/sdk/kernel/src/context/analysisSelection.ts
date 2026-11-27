import { heldSelectionProblem, panelOutputRef, parseQuery, type AnalysisSelection, type AnalysisSelectionShape, type AnalysisSelectionUse, type PanelInstance, type PanelInstanceInput, type Text } from '@ap/contracts';
import { createContext, createElement, use, useCallback, useEffect, useInsertionEffect, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { LentPanelOutputsContext, LentPanelPlatformContext, PaneScreenContext, ScreenContext, type AddressTransition } from '../platform/contexts';
import { usePlatform, usePlatformOptional } from '../platform/hooks';
import type { MenuPlatform } from '../platform/types';
import { analysisSelectionDependencies, indexChartSelectionChannels, indexInstanceOutputs, menuAnalysisSelections, selectionUses, type LentSelectionWriter } from '../registry/analysis-selections';
import type { MenuEntry } from '../registry/registry';
import { sameItems, useStable } from '../stable';
import { analysisSelectionParam, parseAnalysisSelection } from './analysisSelectionCodec';
import { analysisSelectionRangeCompare, isAnalysisSelectionAvailable, readAvailability, readEmptyAvailability, sameAvailability, subscribeToEmptyAvailability, type AnalysisSelectionAvailability } from './analysisSelectionAvailability';
import { drillLevelKeys } from './drillReset';

export { ANALYSIS_SELECTION_MAX_VALUES, analysisSelectionParam, parseAnalysisSelection } from './analysisSelectionCodec';

/** What a proposed selection writes to the URL and how it reads back; null when the codec would not read it back (#2870 Q6). */
function writeProposal(shape: AnalysisSelectionShape, next: AnalysisSelection | null): { param: string | string[] | null; normalized: AnalysisSelection | null } | null {
  const param = next && analysisSelectionParam(next);
  const written = typeof param === 'string' ? [param] : param ?? [];
  const normalized = parseAnalysisSelection(shape, written);
  return !normalized && written.length ? null : { param, normalized };
}

function sameSelection(a: AnalysisSelection | null, b: AnalysisSelection | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.shape === 'set' && b.shape === 'set') return sameItems(a.values, b.values);
  return a.shape === 'range' && b.shape === 'range' && a.from === b.from && a.to === b.to;
}

const noRoute = { panels: [] };
const noLent: readonly LentSelectionWriter[] = [];
declare const process: { env: { NODE_ENV?: string } };
const AnalysisSelectionInstancesContext = createContext<{
  store: NonNullable<ReturnType<typeof useWriteScreen>>['analysisSelectionAvailability'] | undefined;
  graph: ReturnType<typeof analysisSelectionDependencies>;
  chartIds: ReadonlySet<string>;
} | undefined>(undefined);

/** Supplies the workspace's configured instances to its panels and publishes their graph to the screen header. */
export function AnalysisSelectionInstances({ instances, publishers, children }: {
  instances: readonly PanelInstance[] | undefined;
  /** The instance that currently publishes each overridden URL key. Use null when there is no live publisher. */
  publishers?: ReadonlyMap<string, string | null>;
  children: ReactNode;
}) {
  const { route, registry } = usePlatform();
  const menu = route?.menu;
  const channels = useChannels(menu, registry);
  const screen = useWriteScreen(route);
  const store = use(LentPanelPlatformContext) === null && screen?.route?.menu === menu ? screen?.analysisSelectionAvailability : undefined;
  const outputs = useMemo(() => instances && indexInstanceOutputs(instances), [instances]);
  const indexed = useMemo(() => store && menu && outputs ? indexChartSelectionChannels(menu, channels, outputs) : undefined, [store, menu, channels, outputs]);
  const chartChannels = useStable(indexed?.channels, (a, b) => a === b || !!a && !!b && a.size === b.size && [...a].every(([key, channel]) => {
    const other = b.get(key);
    return channel.dimension === other?.dimension && channel.shape === other.shape && chartChannelWriter(channel.writers).panelId === chartChannelWriter(other.writers).panelId;
  }));
  const value = useMemo(() => {
    if (!instances || !outputs || !store) return;
    const all = chartChannels?.size ? new Map([...channels, ...chartChannels]) : channels;
    const workspace = { instances, publishers, outputs, chartChannels };
    const chartIds = new Set(instances.filter(instance => instance.source.kind === 'chart').map(instance => instance.id));
    return { store, graph: analysisSelectionDependencies(all, workspace), chartIds };
  }, [store, instances, publishers, channels, outputs, chartChannels]);
  useLayoutEffect(() => {
    if (store && value) return store.publishGraph(value.graph);
  }, [store, value]);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') for (const reason of indexed?.rejected ?? []) console.warn(reason);
  }, [indexed]);
  return createElement(AnalysisSelectionInstancesContext.Provider, { value }, children);
}

/** The menu's channels, with lent panels that bind outputs as writers after its own (#2763). */
const useChannels = (menu: MenuEntry | undefined, registry: MenuPlatform['registry'] | undefined) => {
  const lent = menu && registry ? registry.lentPanels(menu.id) : noLent;
  return useMemo(() => menuAnalysisSelections(menu ?? noRoute, lent), [menu, lent]);
};

/** Channel display name for SDK actions, including keys shared by multiple writers. */
export function useAnalysisSelectionChannelName(
  platform: Pick<MenuPlatform, 'route' | 'registry'>, key: string | undefined,
): Text | string | undefined {
  const channels = useChannels(key === undefined ? undefined : platform.route?.menu, platform.registry);
  const channel = key === undefined ? undefined : channels.get(key);
  return channel?.label ?? channel?.dimension;
}

/**
 * The declared display name of each analysis selection key of the current menu (lent writers included), for host copy that
 * names a key, such as saved-view notices (#3139). A key whose channel declares no label gives undefined: callers show the key.
 */
export function useAnalysisSelectionLabels(platform: Pick<MenuPlatform, 'route' | 'registry'>): (key: string) => Text | undefined {
  const channels = useChannels(platform.route?.menu, platform.registry);
  return useCallback((key: string) => channels.get(key)?.label, [channels]);
}

const useWriteScreen = (route: MenuPlatform['route']) => route ? use(PaneScreenContext) ?? use(ScreenContext) : null;

const readNoGraph = () => undefined;

/** Chart channels are built with one writer. A missing one is the same failure as reading `[0].panelId`. */
function chartChannelWriter<T>(writers: readonly T[]): T {
  const writer = writers[0];
  if (writer === undefined) throw new Error('Chart selection channel requires a writer');
  return writer;
}

function chartInstanceOutput(graph: ReturnType<typeof analysisSelectionDependencies>, key: string, instanceId: string) {
  const namespaced = panelOutputRef(instanceId, key);
  if (graph.chartChannels?.has(namespaced)) return namespaced;
  const channel = graph.chartChannels?.get(key);
  if (channel !== undefined && chartChannelWriter(channel.writers).panelId === instanceId) return key;
}

/** Host chart metadata for a registered instance output; null when the chart instance's output was rejected. */
export function useChartInstanceSelectionOutput(key: string | undefined, instanceId: string | undefined): { key: string; shape: AnalysisSelectionShape; dimension: string } | null | undefined {
  const configured = use(AnalysisSelectionInstancesContext);
  const platform = usePlatformOptional();
  const screen = useWriteScreen(platform?.route ?? null);
  if (use(LentPanelPlatformContext) !== null || !configured || configured.store !== screen?.analysisSelectionAvailability
    || key === undefined || instanceId === undefined) return;
  const outputKey = chartInstanceOutput(configured.graph, key, instanceId);
  if (outputKey !== undefined) {
    const channel = configured.graph.chartChannels?.get(outputKey);
    const selection = channel === undefined ? undefined : chartChannelWriter(channel.writers).selection;
    return selection && { key: outputKey, shape: selection.shape, dimension: selection.dimension };
  }
  return configured.chartIds.has(instanceId) ? null : undefined;
}

function useSelectionDependencies(channels: ReturnType<typeof menuAnalysisSelections>, screen: ReturnType<typeof useWriteScreen>, menu: MenuEntry | undefined) {
  const configured = use(AnalysisSelectionInstancesContext);
  const store = screen?.route?.menu === menu ? screen?.analysisSelectionAvailability : undefined;
  const local = configured?.store === store ? configured?.graph : undefined;
  const sharedStore = local ? undefined : store;
  const shared = useSyncExternalStore(sharedStore?.subscribe ?? subscribeToEmptyAvailability, sharedStore?.graph ?? readNoGraph, readNoGraph);
  return useMemo(() => local ?? shared ?? analysisSelectionDependencies(channels), [channels, local, shared]);
}

function drillAddress(menu: MenuEntry | undefined, pageParam: MenuPlatform['pageParam']) {
  return JSON.stringify(menu?.drill?.levels.flatMap(drillLevelKeys).map(pageParam) ?? []);
}

function useReportedAvailability(screen: ReturnType<typeof useWriteScreen>, address: string, graph: ReturnType<typeof analysisSelectionDependencies>) {
  const store = screen?.analysisSelectionAvailability;
  const snapshot = useSyncExternalStore(store?.subscribe ?? subscribeToEmptyAvailability, store?.read ?? readEmptyAvailability, readEmptyAvailability);
  return (key: string) => readAvailability(snapshot, key, address, graph.publisher(key));
}

/** Starts a transient chip interaction. Release it on leave, blur or unmount. */
export function useAnalysisSelectionHoverTarget(key: string | undefined) {
  const platform = usePlatformOptional();
  const screen = useWriteScreen(platform?.route ?? null);
  const hover = screen?.analysisSelectionAvailability.hover;
  const address = screen ? drillAddress(screen.route?.menu, screen.pageParam) : '';
  return useCallback(() => key === undefined ? undefined : hover?.begin(key, address), [hover, key, address]);
}

const noHighlight = () => false;
function useSelectionHighlight(screen: ReturnType<typeof useWriteScreen>, address: string, matches: (key: string) => boolean) {
  const hover = screen?.analysisSelectionAvailability.hover;
  return useSyncExternalStore(hover?.subscribe ?? subscribeToEmptyAvailability, () => {
    const current = hover?.read();
    return current?.drillAddress === address && matches(current.key);
  }, noHighlight);
}

/** Whether this panel is the first writer for the current chip interaction. */
export function useAnalysisSelectionSourceHighlighted(panelId: string) {
  const platform = usePlatformOptional();
  const screen = useWriteScreen(platform?.route ?? null);
  const declared = useChannels(platform?.route?.menu, platform?.registry);
  const { channels } = useSelectionDependencies(declared, screen, platform?.route?.menu);
  const address = screen ? drillAddress(screen.route?.menu, screen.pageParam) : '';
  return useSelectionHighlight(screen, address, key => {
    const channel = channels.get(key);
    return !!screen && !!channel && channel.writers[0]?.panelId === panelId
      && parseAnalysisSelection(channel.shape, screen.pageParams(key)) !== null;
  });
}

export type AnalysisSelectionOutputOptions = {
  /** Values present in the source's current data. Omit while availability is unknown. */
  available?: AnalysisSelectionAvailability | undefined;
  /** Required for availability reporting when this channel has a configured publisher. */
  instanceId?: string;
  /** Set false in callers that only write selections or report availability. */
  subscribeHighlight?: boolean;
};

/** Reads and writes a declared analysis selection through the menu page key (ADR-0175). */
export function useAnalysisSelectionOutput(panelId: string, key: string, options?: AnalysisSelectionOutputOptions) {
  return useSelectionOutput(usePlatform(), { panelId, key }, options);
}

/** The chart can omit the output and also runs without a platform provider. */
export function useOptionalAnalysisSelectionOutput(output: { panelId: string; key: string } | undefined, options?: AnalysisSelectionOutputOptions) {
  return useSelectionOutput(usePlatformOptional(), output, options);
}

function useSelectionOutput(sourcePlatform: MenuPlatform | null, sourceOutput: { panelId: string; key: string } | undefined, options?: AnalysisSelectionOutputOptions): {
  selection: AnalysisSelection | null;
  select: (next: AnalysisSelection | null) => boolean;
  /** Whether readers of this source see the supplied availability (or its withdrawal). */
  availabilityCurrent: boolean;
  /** Whether a chip for this output is currently hovered or focused. First writer only. */
  highlighted: boolean;
} {
  // A lent panel's bound output writes the receiver's key as the lent writer, through a setPage limited to that key (#2763).
  const lent = use(LentPanelOutputsContext);
  const mapped = sourceOutput && lent?.keys.get(sourceOutput.key);
  const platform: Pick<MenuPlatform, 'route' | 'pageParam' | 'pageParams' | 'registry' | 'setPage'> | null = lent && mapped !== undefined ? lent.receiver : sourcePlatform;
  const alive = lent && mapped !== undefined ? lent.alive : undefined;
  const output = lent && mapped !== undefined ? { panelId: lent.writerId, key: mapped } : sourceOutput;
  const { route, pageParam, pageParams, setPage, registry } = (output && platform) || {};
  const screen = useWriteScreen(route ?? null);
  const declared = useChannels(route?.menu, registry);
  const dependencies = useSelectionDependencies(declared, screen, route?.menu);
  const configured = use(AnalysisSelectionInstancesContext);
  const store = screen?.analysisSelectionAvailability;
  const instanceId = options?.instanceId;
  const chart = !lent && configured?.store === store && instanceId !== undefined && configured?.chartIds.has(instanceId);
  const key = chart && output ? chartInstanceOutput(dependencies, output.key, instanceId) : output?.key;
  const panelId = chart ? instanceId : output?.panelId;
  const channel = key === undefined ? undefined : (chart ? dependencies.chartChannels : declared)?.get(key);
  const address = pageParam ? drillAddress(route?.menu, pageParam) : '';
  const report = useStable(options?.available, sameAvailability);
  const isSource = channel?.writers[0]?.panelId === panelId && key !== undefined && dependencies.ownsChannel(key, options?.instanceId);
  const publisher = key === undefined ? undefined : dependencies.publisher(key);
  const canReport = key !== undefined && isSource && !dependencies.hasCycle(key);
  const availabilityCurrent = useSyncExternalStore(
    canReport && store ? store.subscribe : subscribeToEmptyAvailability,
    () => key !== undefined && canReport && store !== undefined && sameAvailability(readAvailability(store.read(), key, address, publisher), report),
    () => false,
  );
  useEffect(() => {
    if (key !== undefined && store && canReport && publisher !== null && report !== undefined) return store.report(key, { drillAddress: address, publisher, available: report });
  }, [store, canReport, key, publisher, report, address]);
  const rendered = key === undefined ? undefined : pageParams?.(key);
  const selection = channel && rendered ? parseAnalysisSelection(channel.shape, rendered) : null;
  const highlightScreen = isSource && options?.subscribeHighlight !== false ? screen : null;
  const highlighted = useSelectionHighlight(highlightScreen, address, hoveredKey => hoveredKey === key && selection !== null);
  if (!chart && output && route && !channel?.writers.some(writer => writer.panelId === panelId)) throw new RangeError(`Panel "${panelId}" does not declare analysis selection output "${key}"`);
  return { selection, availabilityCurrent, highlighted, select(next) {
    if (key === undefined || !rendered || !setPage || alive?.() === false) return false;
    if (chart && store?.graph()?.chartChannels?.get(key) !== channel) return false;
    const current = screen?.pageParamsNow(key);
    if (!current || !channel || (next && next.shape !== channel.shape)) return false;
    const proposal = writeProposal(channel.shape, next);
    if (!proposal) return false;
    const { param, normalized } = proposal;
    const holds = (values: readonly string[]) => normalized === null ? values.length === 0 : sameSelection(parseAnalysisSelection(channel.shape, values), normalized);
    // Skip only when both the rendered and the latest proposed address hold it, so a board pane can resend an unaccepted proposal.
    if (holds(current) && holds(rendered)) return true;
    setPage({ [key]: normalized ? param : null });
    return true;
  } };
}

export type AppliedAnalysisSelection = {
  readonly key: string;
  readonly use: AnalysisSelectionUse;
  readonly selection: AnalysisSelection;
  /** The panel instance holds this value (`HeldAnalysisSelections`, #2862); absent when it follows the URL. */
  readonly held?: true;
} & ({
  /** The saved output’s writer, or the first declared writer for a declaration-only input. */
  readonly source: { readonly panelId: string; readonly title: Text; readonly dimension: string };
  readonly dimension?: never;
} | {
  /** A receive-only channel has no local writer. Its dimension comes from the inbound declaration. */
  readonly source?: never;
  readonly dimension: string;
});

/** One held selection with the dimension it was captured in (#2862 R C2). */
export type HeldAnalysisSelection = { readonly dimension: string; readonly selection: AnalysisSelection };
/** Selections one panel instance holds (#2862), by page key; null outside a held instance. */
const HeldSelectionContext = createContext<ReadonlyMap<string, HeldAnalysisSelection> | null>(null);

/** Reads an explicitly mapped held input at an instance boundary. */
export function useHeldAnalysisSelection(key: string | undefined): HeldAnalysisSelection | undefined {
  return key === undefined ? undefined : use(HeldSelectionContext)?.get(key);
}

/**
 * Wraps one panel instance that holds selections (#2862): inside, `useAnalysisSelectionInputs` reads `held` for those keys instead of
 * the URL, marks them `held`, and does not wait for the source's availability (the value is fixed). Other keys still follow the URL.
 * A held value applies only when it passes the saved-view value rule (`heldSelectionProblem`) and its dimension and shape match the
 * key's channel now; otherwise the key is in `rejectedHeld` and the panel does not fall back to the URL for it.
 * The menu owns `held` (its saved `panels` and screen memory); nothing here writes the URL.
 */
export function HeldAnalysisSelections({ held, children }: { held: Readonly<Record<string, HeldAnalysisSelection>>; children: ReactNode }) {
  const map = useMemo(() => new Map(Object.entries(held)), [held]);
  return createElement(HeldSelectionContext.Provider, { value: map }, children);
}

type AnalysisSelectionInputs = {
  applied: readonly AppliedAnalysisSelection[];
  filtered: boolean;
  /** Declared input keys whose URL values were discarded. */
  rejected: readonly string[];
  /** Keys this held instance holds whose value cannot apply (invalid, or another dimension or shape now, #2862). Not URL errors. */
  rejectedHeld: readonly string[];
  /** Declared input keys whose valid values are absent from the source data. */
  unavailable: readonly string[];
};

type AnalysisSelectionRead = AnalysisSelectionInputs & {
  /** Filter keys with valid URL selections, before checking the source's availability. */
  requestedFilters: readonly string[];
  /** Follow keys whose saved output cannot publish to the live URL channel. */
  unavailableSources: readonly string[];
};

/**
 * Reads saved connections from one workspace subscription; omit the input list to use the declaration.
 * The saved hold supplies connection metadata. Its value must be provided by HeldAnalysisSelections.
 */
export function useAnalysisSelectionReader(panelId: string): (inputs?: readonly PanelInstanceInput[]) => AnalysisSelectionRead {
  const { route, pageParam, pageParams, registry } = usePlatform();
  const menu = route?.menu;
  const channels = useChannels(menu, registry);
  const heldSelections = use(HeldSelectionContext);
  const screen = useWriteScreen(route);
  const graph = useSelectionDependencies(channels, screen, menu);
  const availability = useReportedAvailability(screen, drillAddress(menu, pageParam), graph);
  if (menu && !menu.panels?.some(panel => panel.id === panelId)) throw new RangeError(`Unknown panel "${panelId}" in menu "${menu.id}"`);
  return inputs => readInputs(panelId, graph.channels, pageParams, availability, heldSelections, graph, inputs);
}

function readInputs(panelId: string, channels: ReturnType<typeof menuAnalysisSelections>, pageParams: MenuPlatform['pageParams'],
  availability: ReturnType<typeof useReportedAvailability>, heldSelections: ReadonlyMap<string, HeldAnalysisSelection> | null,
  graph: ReturnType<typeof analysisSelectionDependencies>,
  instanceInputs?: readonly PanelInstanceInput[],
): AnalysisSelectionRead {
  const applied: AppliedAnalysisSelection[] = [];
  const requestedFilters: string[] = [];
  const rejected: string[] = [];
  const rejectedHeld: string[] = [];
  const unavailable: string[] = [];
  const unavailableSources: string[] = [];
  for (const [key, channel] of channels) {
    const instanceInput = instanceInputs?.find(input => input.key === key);
    if (instanceInputs && !instanceInput) continue;
    const uses = selectionUses(channel, panelId, instanceInput);
    if (!uses.length) continue;

    const { dimension, shape, writers } = channel;
    const source = instanceInput && graph.sourceFor(instanceInput);
    const held = !instanceInput || instanceInput.mode === 'hold' ? heldSelections?.get(key) : undefined;
    const writer = instanceInput ? source?.writer : writers[0];
    const writerDetails = writer ? { source: { panelId: writer.panelId, title: writer.title, dimension } } : { dimension };
    if (instanceInput?.mode === 'hold' || held) {
      if (!held || (instanceInput && !source) || held.dimension !== dimension || held.selection?.shape !== shape
        || heldSelectionProblem(held.selection)) rejectedHeld.push(key);
      else for (const use of uses) applied.push({ key, use, selection: held.selection, held: true, ...writerDetails });
      continue;
    }

    if (instanceInput && (!source?.writer
      || channels.get(source.key)?.writers[0]?.panelId !== source.writer.panelId
      || (graph.configured && graph.publisher(source.key) !== source.node))) {
      unavailableSources.push(key);
      unavailable.push(key);
      continue;
    }
    const sourceKey = source?.key ?? key;
    const values = pageParams(sourceKey);
    if (!values.length) continue;
    const selection = parseAnalysisSelection(shape, values);
    if (!selection) {
      rejected.push(key);
      continue;
    }
    if (uses.includes('filter')) requestedFilters.push(key);
    if (!isAnalysisSelectionAvailable(selection, availability(sourceKey))) {
      unavailable.push(key);
      continue;
    }
    for (const use of uses) applied.push({ key, use, selection, ...writerDetails });
  }
  return { applied, filtered: applied.some(input => input.use === 'filter'), requestedFilters, rejected, rejectedHeld, unavailable, unavailableSources };
}

/** Reports applied inputs without running queries. Panels reading a filter use its value from applied. */
export function useAnalysisSelectionInputs(panelId: string, inputs?: readonly PanelInstanceInput[]): AnalysisSelectionInputs {
  const { route, session, revision, global } = usePlatform();
  const menu = route?.menu;
  const { applied, filtered, rejected, rejectedHeld, unavailable } = useAnalysisSelectionReader(panelId)(inputs);
  const result = { applied, filtered, rejected, rejectedHeld, unavailable };
  return useStable({ menu, panelId, session, revision, scopeId: global.scopeId, result }, (a, b) =>
    a.menu === b.menu && a.panelId === b.panelId && a.session === b.session && a.revision === b.revision && a.scopeId === b.scopeId
    && a.result.applied.length === b.result.applied.length
    && sameItems(a.result.rejected, b.result.rejected)
    && sameItems(a.result.rejectedHeld, b.result.rejectedHeld)
    && sameItems(a.result.unavailable, b.result.unavailable)
    && a.result.applied.every((input, i) => {
      const other = b.result.applied[i];
      if (other === undefined) throw new Error('Equal-length analysis selection inputs must have matching entries');
      return input.key === other.key && input.use === other.use && input.held === other.held
        && (!inputs || (input.dimension === other.dimension && input.source?.panelId === other.source?.panelId
          && input.source?.title === other.source?.title && input.source?.dimension === other.source?.dimension))
        && sameSelection(input.selection, other.selection);
    }),
  ).result;
}

export type AnalysisSelectionChip = {
  readonly key: string;
  readonly selection: AnalysisSelection;
  readonly dimension: string;
  readonly label: Text | null;
  /** First declared local writer, absent for receive-only channels. */
  readonly source?: { readonly panelId: string; readonly title: Text };
  /** Validated return target whose URL contains the same selection in the same Scope. */
  readonly arrival?: { readonly href: string; readonly origin?: { readonly menuLabel: Text } };
  readonly after: string | null;
  readonly available: boolean;
  /** False for an inbound-only channel with no declared reader panel. Absence means applied. */
  readonly applied?: boolean;
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
    const [first] = remaining;
    if (first === undefined) throw new Error('Cycle break requires a remaining chip');
    let key: string | null = first.key;
    while (key !== null && !seen.includes(key)) {
      seen.push(key);
      key = waiting.get(key)?.after ?? null;
    }
    const cycle = new Set(key === null ? seen : seen.slice(seen.indexOf(key)));
    const root = remaining.find(chip => cycle.has(chip.key)) ?? remaining[0];
    if (root === undefined) throw new Error('Cycle break requires a remaining chip');
    waiting.set(root.key, { ...root, after: null });
  }
  return ordered;
}

export type ReplaceChipSelection = (key: string, next: AnalysisSelection, onCommit?: () => void) => boolean;
export type ChipSelectionEditor = {
  /** Current source reports for active chips. A missing entry means availability is unknown. */
  readonly availability: ReadonlyMap<string, AnalysisSelectionAvailability>;
  /** Replaces an active selection. Returns false for invalid or stale edits. Calls onCommit when accepted. */
  readonly replace: ReplaceChipSelection;
};

function readSelectionOrigin({ returnOrigin, registry, global }: Pick<MenuPlatform, 'returnOrigin' | 'registry' | 'global'>) {
  const { href, accepted, recorded, menuLabel } = returnOrigin();
  if (!accepted) return null;
  const q = href.indexOf('?');
  const route = registry.matchRoute(q === -1 ? href : href.slice(0, q));
  if (!route) return null;
  const { menu } = route;
  const parsed = parseQuery(q === -1 ? '' : href.slice(q), menu.pageKeys, { repeated: menu.repeatedPageKeys });
  if (parsed.global.scopeId !== global.scopeId) return null;
  // The origin's lent writers count as its outputs, as they did when the link was planned (#2763 R C5).
  return { href, page: parsed.page, menuLabel: recorded ? menuLabel : undefined, channels: menuAnalysisSelections(menu, registry.lentPanels(menu.id)) };
}

/** Models URL-backed analysis selections. After the guard and before writing, onClearCommit receives the key (null for clear-all) and the address transition. */
export function useAnalysisSelectionChips(onClearCommit?: (key: string | null, address: AddressTransition) => void): {
  chips: readonly AnalysisSelectionChip[];
  clear: (key: string) => boolean;
  clearAll: () => boolean;
  editor?: ChipSelectionEditor;
} {
  const platform = usePlatform();
  const { route, pathname, pageParam, pageParams, session, revision, global } = platform;
  const screen = useWriteScreen(route);
  const address = drillAddress(route?.menu, pageParam);
  const menu = route?.menu;
  const paneId = screen?.paneId;
  const scopeId = global.scopeId;
  const declared = useChannels(menu, platform.registry);
  const dependencies = useSelectionDependencies(declared, screen, route?.menu);
  const { channels } = dependencies;
  const availability = useReportedAvailability(screen, address, dependencies);
  const origin = menu?.analysisSelectionInbound?.length ? readSelectionOrigin(platform) : null;
  const active: Omit<AnalysisSelectionChip, 'after'>[] = [];
  const reports = new Map<string, AnalysisSelectionAvailability>();
  for (const [key, { shape, dimension, label, writers, readers, inbound }] of channels) {
    const [writer] = writers;
    const values = pageParams(key);
    const selection = parseAnalysisSelection(shape, values);
    if (!selection) continue;
    const matchesOrigin = inbound && origin && [...origin.channels].some(([sourceKey, source]) =>
      source.writers.length > 0 && source.dimension === dimension && source.shape === shape
      && sameSelection(selection, parseAnalysisSelection(shape, origin.page.filter(([k]) => k === sourceKey).map(([, value]) => value))));
    const proof = screen?.returnCarry;
    const carried = proof && Object.hasOwn(proof, key) ? proof[key] : undefined;
    const menuLabel = origin?.menuLabel && carried && sameItems(carried, values) ? origin.menuLabel : undefined;
    const reported = availability(key);
    if (reported !== undefined) reports.set(key, reported);
    active.push({ key, selection, dimension, label: label ?? null, available: isAnalysisSelectionAvailable(selection, reported),
      ...(inbound && writers.length === 0 && readers.length === 0 && { applied: false }),
      ...(writer && { source: { panelId: writer.panelId, title: writer.title } }),
      ...(matchesOrigin && { arrival: { href: origin.href, ...(menuLabel && { origin: { menuLabel } }) } }),
    });
  }
  // Keep channel order for active parents, as in the declaration-only chip model (#2763 R2 C12).
  const result = orderChips(active.map(chip => {
    const parents = dependencies.parents(chip.key);
    const parent = active.find(candidate => candidate.key !== chip.key && parents.some(({ key }) => key === candidate.key));
    return { ...chip, after: parent?.key ?? null };
  }));
  // Page values can change within this edit owner until the drill source changes.
  const owner = useMemo(() => ({
    menu, pathname, paneId, session, revision, scopeId, address,
    clearKeys: null as ((keys: Iterable<string>, key: string | null) => boolean) | null,
    replace: null as ReplaceChipSelection | null,
  }), [menu, pathname, paneId, session, revision, scopeId, address]);
  const replace = useCallback<ReplaceChipSelection>((key, next, onCommit) => owner.replace?.(key, next, onCommit) ?? false, [owner]);
  const reportedAvailability = useStable(reports, (a, b) =>
    a.size === b.size && [...a].every(([key, value]) => sameAvailability(value, b.get(key))),
  );
  const { chips } = useStable({ owner, configured: dependencies.configured, chips: result }, (a, b) =>
    a.owner === b.owner && a.configured === b.configured
    && a.chips.length === b.chips.length && a.chips.every((chip, i) => {
      const other = b.chips[i];
      if (other === undefined) throw new Error('Equal-length analysis selection chips must have matching entries');
      return chip.key === other.key && chip.dimension === other.dimension && (!dependencies.configured || chip.after === other.after) && chip.available === other.available && chip.applied === other.applied && chip.arrival?.href === other.arrival?.href
        && chip.arrival?.origin?.menuLabel === other.arrival?.origin?.menuLabel
        && sameSelection(chip.selection, other.selection);
    }),
  );

  // Bind the committed screen before descendant layout effects can clear it, as pane address writes do.
  useInsertionEffect(() => {
    if (!screen || !route) return;
    const commit = (patch: Record<string, string | readonly string[] | null>, run: (address: AddressTransition) => boolean) => {
      screen.setPage(patch, { run });
      return true;
    };
    owner.clearKeys = (keys, key) => {
      const patch = new Map<string, null>();
      for (const key of keys) {
        const current = screen.pageParamsNow(key);
        if (!current) return false;
        // A pane can ask again if its parent still renders the value after a clear proposal.
        if (current.length || (screen.screenMode === 'pane' && pageParams(key).length)) patch.set(key, null);
      }
      if (!patch.size) return false;
      return commit(Object.fromEntries(patch), address => {
        if (owner.clearKeys) onClearCommit?.(key, address);
        return true;
      });
    };
    owner.replace = (key, next, onCommit) => {
      const shape = channels.get(key)?.shape;
      if (shape !== next.shape) return false;
      const values = screen.pageParamsNow(key);
      const rendered = parseAnalysisSelection(shape, pageParams(key));
      if (!values || !rendered) return false;
      const current = parseAnalysisSelection(shape, values);
      // The board can propose another edit until its parent applies the previous one.
      if (!current && screen.screenMode !== 'pane') return false;
      const proposal = writeProposal(shape, next);
      if (!proposal) return false;
      const { param, normalized } = proposal;
      if (normalized?.shape === 'range') {
        // The selection carries no axis, so equal ends stay valid here (a one-category range); a time-axis chart refuses
        // to draw or apply a zero-length range itself (#2854 C5).
        const compare = analysisSelectionRangeCompare(reportedAvailability.get(key));
        try {
          if (!(compare(normalized.from, normalized.to) <= 0)) return false;
        } catch {
          // A source comparator may reject malformed text. The editor displays its validation error.
          return false;
        }
      }
      if (sameSelection(current, normalized) && sameSelection(rendered, normalized)) {
        onCommit?.();
        return true;
      }
      return commit({ [key]: normalized ? param : null }, address => {
        if (!owner.replace) return false;
        if (!normalized) onClearCommit?.(key, address);
        onCommit?.();
        return true;
      });
    };
    return () => { owner.clearKeys = null; owner.replace = null; };
  }, [owner, screen, route, pageParams, channels, reportedAvailability, onClearCommit]);

  const canEdit = screen !== null;
  return useMemo(() => ({
    chips,
    clear: (key: string) => channels.has(key) && (owner.clearKeys?.([key], key) ?? false),
    clearAll: () => owner.clearKeys?.(channels.keys(), null) ?? false,
    ...(canEdit ? { editor: { availability: reportedAvailability, replace } } : {}),
  }), [chips, channels, owner, canEdit, reportedAvailability, replace]);
}
