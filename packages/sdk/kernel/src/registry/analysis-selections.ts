import { GLOBAL_KEYS, RETURN_TO_KEY, type AnalysisSelectionUse, type MenuMeta, panelOutputRef, type PanelBinding, type PanelDeclaration, type PanelInstance, type PanelInstanceInput, type PanelInstanceOutput, type Text } from '@ap/contracts';
import { DETAIL_EXPAND_KEY } from '../links/detail-expansion';
import { isIdShape, isObjectKindShape } from './shapes';

type SelectionOutput = PanelDeclaration['outputs'][number]['selection'];
type Channel = NonNullable<SelectionOutput> & {
  inbound?: true;
  writers: { panelId: string; title: Text; selection: SelectionOutput }[];
  readers: { panelId: string; use: AnalysisSelectionUse }[];
};

/** A lent panel whose outputs write receiver keys (`outputs`: source output key → receiver page key). */
export type LentSelectionWriter = {
  readonly binding: Pick<PanelBinding, 'source' | 'outputs' | 'page'>;
  readonly source: Pick<PanelDeclaration, 'title' | 'outputs' | 'queryInputs'>;
};

/**
 * Whether a lent panel output may write a receiving key (ADR-0176, #2763): the key must be one of the receiver's own analysis
 * selection channels and the source output must be a selection of the same dimension and shape. Returns the reason it may
 * not, or null. Context, drill and return keys are never channels, so they are refused here too.
 */
export function lentOutputProblem(receiver: ReadonlyMap<string, { dimension: string; shape: string }>, source: Pick<PanelDeclaration, 'outputs'>, outputKey: string, target: unknown): string | null {
  const selection = source.outputs.find(output => output.key === outputKey)?.selection;
  if (!selection) return `output "${outputKey}" is not an analysis selection output of the source panel`;
  if (!target || typeof target !== 'object' || (target as { kind?: unknown }).kind !== 'page' || typeof (target as { key?: unknown }).key !== 'string') {
    return `output "${outputKey}" must bind a receiving page key`;
  }
  const key = (target as { key: string }).key;
  const channel = receiver.get(key);
  if (!channel) return `output "${outputKey}" must write an analysis selection key of the receiving menu, not "${key}"`;
  if (channel.dimension !== selection.dimension || channel.shape !== selection.shape) {
    return `output "${outputKey}" (${selection.dimension} ${selection.shape}) does not match "${key}" (${channel.dimension} ${channel.shape})`;
  }
  return null;
}

/** Indexes analysis selection declarations by their page key (ADR-0175). Lent writers follow the menu's own writers. */
export function menuAnalysisSelections(menu: Pick<MenuMeta, 'panels' | 'analysisSelectionInbound'>, lent: readonly LentSelectionWriter[] = []): ReadonlyMap<string, Channel> {
  const channels = new Map<string, Channel>();
  for (const panel of menu.panels ?? []) {
    for (const { key, selection } of panel.outputs) {
      if (!selection) continue;
      const channel = channels.get(key);
      if (!channel) channels.set(key, { ...selection, writers: [], readers: [] });
      else if (channel.label === undefined && selection.label !== undefined) channels.set(key, { ...channel, label: selection.label });
    }
  }
  for (const { key, dimension, shape, label } of menu.analysisSelectionInbound ?? []) {
    channels.set(key, { ...channels.get(key), dimension, shape, label, inbound: true, writers: [], readers: [] });
  }
  for (const { id: panelId, title, outputs, queryInputs, displayInputs } of menu.panels ?? []) {
    for (const { key, selection } of outputs) channels.get(key)?.writers.push({ panelId, title, selection });
    for (const { key, selection } of [...queryInputs.page ?? [], ...displayInputs.page ?? []]) {
      if (selection !== undefined) channels.get(key)?.readers.push({ panelId, use: selection });
    }
  }
  for (const { binding, source } of lent) {
    // A lent panel that reads a receiver selection key (a page binding; only query inputs can be bound) is its reader, so a
    // filter cycle through it is seen (R C6).
    for (const { key, selection: use } of source.queryInputs.page ?? []) {
      const input = binding.page?.[key];
      if (use !== undefined && input?.kind === 'page') channels.get(input.key)?.readers.push({ panelId: binding.source, use });
    }
    for (const [outputKey, target] of Object.entries(binding.outputs ?? {})) {
      const selection = source.outputs.find(output => output.key === outputKey)?.selection;
      // The lent writer is named by its source, so the chip names the borrowed chart (#2763).
      if (selection) channels.get(target.key)?.writers.push({ panelId: binding.source, title: source.title, selection });
    }
  }
  return channels;
}

type Channels = ReturnType<typeof menuAnalysisSelections>;
type FilterDependency = { node: string; key: string };

export function indexInstanceOutputs(instances: readonly PanelInstance[]) {
  return new Map<string, { instance: PanelInstance; output: PanelInstanceOutput }>(instances.flatMap(instance => instance.outputs.map(output =>
    [panelOutputRef(instance.id, output.key), { instance, output }] as const)));
}

export function indexChartSelectionChannels(menu: Pick<MenuMeta, 'pageKeys'>, declared: Channels, outputs: ReturnType<typeof indexInstanceOutputs>) {
  const channels = new Map<string, Channel>();
  const rejected: string[] = [];
  for (const [key, { instance, output }] of outputs) {
    if (instance.source.kind !== 'chart') continue;
    const { dimension, shape } = output;
    if (!isIdShape(instance.id) || !isIdShape(output.key) || !isObjectKindShape(dimension) || (shape !== 'set' && shape !== 'range')) {
      rejected.push(`Invalid chart selection key or output "${key}"`);
      continue;
    }
    if (declared.has(key) || menu.pageKeys.includes(key) || GLOBAL_KEYS.has(key) || key === RETURN_TO_KEY || key === DETAIL_EXPAND_KEY) {
      rejected.push(`Chart selection key "${key}" conflicts with a declared or reserved page key`);
      continue;
    }
    const selection = { dimension, shape };
    const title = { ko: instance.id, en: instance.id };
    channels.set(key, { ...selection, readers: [], writers: [{ panelId: instance.id, title, selection }] });
  }
  return { channels, rejected };
}

type AnalysisSelectionWorkspace = {
  instances: readonly PanelInstance[];
  outputs: ReturnType<typeof indexInstanceOutputs>;
  publishers?: ReadonlyMap<string, string | null>;
  chartChannels?: Channels;
};

export function selectionUses(channel: Channel, panelId: string, input?: PanelInstanceInput): readonly AnalysisSelectionUse[] {
  const declared = channel.readers.filter(reader => reader.panelId === panelId).map(reader => reader.use);
  if (!input) return declared;
  return declared.length && input.use ? [input.use] : [...new Set(declared)];
}

/** Resolve the saved reference and check both the stored output and the live declaration against the receiving channel. */
function instanceSelectionSource(channels: Channels, target: Channel, from: string, workspace?: AnalysisSelectionWorkspace) {
  const compatible = (selection: SelectionOutput) => selection?.dimension === target.dimension && selection.shape === target.shape;
  if (workspace) {
    const source = workspace.outputs.get(from);
    if (!source || !compatible(source.output)) return;
    const { instance, output } = source;
    if (instance.source.kind === 'chart') {
      const writer = workspace.chartChannels?.get(from)?.writers[0];
      return writer && { key: from, node: instance.id, writer };
    }
    const declaration = instance.source.kind === 'declared' ? instance.source.panel : undefined;
    const writer = channels.get(output.key)?.writers.find(candidate => candidate.panelId === declaration && compatible(candidate.selection));
    return { key: output.key, node: instance.id, writer };
  }
  // Callers with declaration-addressed inputs can use the live declaration without an instance list.
  for (const [key, channel] of channels) {
    const writer = channel.writers.find(candidate => from === panelOutputRef(candidate.panelId, key) && compatible(candidate.selection));
    if (writer) return { key, node: undefined, writer };
  }
}

/** URL channels keep their first declared writer. In a saved graph, traverse that writer's instance connections. */
export function analysisSelectionDependencies(channels: Channels, workspace?: AnalysisSelectionWorkspace) {
  const roots = new Map<string, string>();
  const upstream = new Map<string, FilterDependency[]>();
  const inputSources = new Map<PanelInstanceInput, ReturnType<typeof instanceSelectionSource>>();
  const resolveSource = (input: PanelInstanceInput) => {
    const channel = channels.get(input.key);
    return channel && instanceSelectionSource(channels, channel, input.from, workspace);
  };
  const declaredParents = new Map<string, FilterDependency[]>();
  for (const [key, { readers }] of channels) {
    for (const [outputKey, output] of channels) {
      if (!readers.some(reader => reader.panelId === output.writers[0]?.panelId && reader.use === 'filter')) continue;
      declaredParents.set(outputKey, [...declaredParents.get(outputKey) ?? [], { node: key, key }]);
    }
  }
  if (workspace) {
    const { instances, outputs, publishers } = workspace;
    for (const { instance, output } of outputs.values()) {
      const { key } = output;
      const channel = channels.get(key);
      const writer = channel?.writers[0];
      if (!writer || output.shape !== channel.shape || output.dimension !== channel.dimension
        || instance.source.kind !== 'declared' || instance.source.panel !== writer.panelId) continue;
      if (publishers?.has(key) ? publishers.get(key) === instance.id : !roots.has(key)) roots.set(key, instance.id);
    }
    for (const [key, channel] of workspace.chartChannels ?? []) {
      const writer = channel.writers[0];
      if (writer === undefined) throw new Error('Chart selection channel requires a writer');
      roots.set(key, writer.panelId);
    }
    for (const instance of instances) {
      if (instance.source.kind !== 'declared') continue;
      for (const input of instance.inputs) {
        const source = resolveSource(input);
        inputSources.set(input, source);
        const channel = channels.get(input.key);
        if (source?.node !== undefined && channel && selectionUses(channel, instance.source.panel, input).includes('filter')) {
          upstream.set(instance.id, [...upstream.get(instance.id) ?? [], { node: source.node, key: source.key }]);
        }
      }
    }
  }
  const publisher = (key: string) => workspace && (roots.get(key) ?? (workspace.publishers?.has(key) ? null : undefined));
  const parents = (key: string) => {
    const owner = publisher(key);
    if (owner === undefined) return declaredParents.get(key) ?? [];
    if (owner === null) return [];
    // Another instance may share the key but its edge cannot order the URL publisher’s chip.
    return (upstream.get(owner) ?? []).filter(parent => roots.get(parent.key) === parent.node);
  };
  return {
    channels,
    chartChannels: workspace?.chartChannels,
    configured: workspace !== undefined,
    parents,
    publisher,
    sourceFor(input: PanelInstanceInput) {
      return inputSources.has(input) ? inputSources.get(input) : resolveSource(input);
    },
    ownsChannel(key: string, instanceId: string | undefined) {
      const owner = publisher(key);
      return owner !== null && owner === instanceId;
    },
    hasCycle(key: string) {
      const owner = publisher(key);
      if (owner === null) return false;
      const root = owner ?? key;
      const edges = owner === undefined ? declaredParents : upstream;
      const pending = [root];
      const visited = new Set(pending);
      for (const node of pending) {
        for (const parent of edges.get(node) ?? []) {
          if (parent.node === root) return true;
          if (visited.has(parent.node)) continue;
          visited.add(parent.node);
          pending.push(parent.node);
        }
      }
      return false;
    },
  };
}
