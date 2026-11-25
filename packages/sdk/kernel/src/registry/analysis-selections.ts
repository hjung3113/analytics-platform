import type { AnalysisSelectionUse, MenuMeta, PanelBinding, PanelDeclaration, Text } from '@ap/contracts';

type SelectionOutput = PanelDeclaration['outputs'][number]['selection'];
type Channel = NonNullable<SelectionOutput> & {
  inbound?: true;
  writers: { panelId: string; title: Text; selection: SelectionOutput }[];
  readers: { panelId: string; use: AnalysisSelectionUse }[];
};

/** A lent panel whose outputs write receiver keys (`outputs`: source output key → receiver page key). */
export type LentSelectionWriter = {
  readonly binding: Pick<PanelBinding, 'source' | 'outputs'>;
  readonly source: Pick<PanelDeclaration, 'title' | 'outputs'>;
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
    for (const { key, selection: use } of [...queryInputs.page ?? [], ...displayInputs.page ?? []]) {
      if (use !== undefined) channels.get(key)?.readers.push({ panelId, use });
    }
  }
  for (const { binding, source } of lent) {
    for (const [outputKey, target] of Object.entries(binding.outputs ?? {})) {
      const selection = source.outputs.find(output => output.key === outputKey)?.selection;
      // The lent writer is named by its source, so the chip names the borrowed chart (#2763).
      if (selection) channels.get(target.key)?.writers.push({ panelId: binding.source, title: source.title, selection });
    }
  }
  return channels;
}
