import type { AnalysisSelectionUse, MenuMeta, PanelDeclaration, Text } from '@ap/contracts';

type SelectionOutput = PanelDeclaration['outputs'][number]['selection'];
type Channel = NonNullable<SelectionOutput> & {
  writers: { panelId: string; title: Text; selection: SelectionOutput }[];
  readers: { panelId: string; use: AnalysisSelectionUse }[];
};

/** Indexes analysis selection declarations by their page key (ADR-0175). */
export function menuAnalysisSelections(menu: Pick<MenuMeta, 'panels'>): ReadonlyMap<string, Channel> {
  const channels = new Map<string, Channel>();
  for (const panel of menu.panels ?? []) {
    for (const { key, selection } of panel.outputs) {
      if (!selection) continue;
      const channel = channels.get(key);
      if (!channel) channels.set(key, { ...selection, writers: [], readers: [] });
      else if (channel.label === undefined && selection.label !== undefined) channels.set(key, { ...channel, label: selection.label });
    }
  }
  for (const { id: panelId, title, outputs, queryInputs, displayInputs } of menu.panels ?? []) {
    for (const { key, selection } of outputs) channels.get(key)?.writers.push({ panelId, title, selection });
    for (const { key, selection: use } of [...queryInputs.page ?? [], ...displayInputs.page ?? []]) {
      if (use !== undefined) channels.get(key)?.readers.push({ panelId, use });
    }
  }
  return channels;
}
