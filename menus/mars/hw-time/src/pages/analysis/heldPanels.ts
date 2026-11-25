import { EQUIPMENT_SELECTION_DIMENSION, PANEL_INSTANCES_MAX, type AnalysisSelection, type MenuViewPanels, type PanelInstance } from '@ap/contracts';
import type { HeldAnalysisSelection } from '@ap/kernel';
import { MOTION_EQUIPMENT_KEY } from '../../endpoints';
import { panelDeclarations } from './panelDeclaration';
import type { Step } from './stepped';

/** `heldFrom`: the drawn panel a held value came from, this session only; that panel cannot be hidden while it is held (#2862 R C7). */
export type AddedPanel = { slot: string; instance: PanelInstance; heldFrom?: string };
export type PanelConfiguration =
  | { kind: 'default' | 'unreadable' }
  /** `sources`: the output-only instances held inputs name, kept as restored and never drawn (#2862). */
  | { kind: 'custom'; added: readonly AddedPanel[]; sources: readonly PanelInstance[] };
export const defaultPanels: PanelConfiguration = { kind: 'default' };
export type CustomPanels = Extract<PanelConfiguration, { kind: 'custom' }>;
export const noPanels: CustomPanels = { kind: 'custom', added: [], sources: [] };
/** How a panel is added: from the toolbar or a pin (no intent) an open panel keeps its inputs; «새 패널» states follow or hold (#2862 R C5). */
export type AddIntent = { mode: 'follow' } | { mode: 'hold'; held: Readonly<Record<string, AnalysisSelection>>; from?: string };

/**
 * The selection source a held input names (#2862): the equipment bars the screen draws itself (the step's current bars or the added
 * «모듈 동작» panel). This menu saves it as an output-only instance with a reserved id, only while something holds it, so `from` names an
 * existing output. A restored one is recognised by the id, the «모듈 동작» declaration and no inputs, and is kept as it was saved (R C2).
 */
export const HELD_SOURCE_ID = 'held-source';
export const heldOutput = { key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' } as const;
export const isHeldSource = (instance: PanelInstance) => (instance.id === HELD_SOURCE_ID || instance.id.startsWith(`${HELD_SOURCE_ID}-`))
  && instance.source.kind === 'declared' && instance.source.panel === panelDeclarations.moduleMotions.id && instance.inputs.length === 0;
export const holds = (instance: PanelInstance) => instance.inputs.some(input => input.mode === 'hold');
export const names = (instances: readonly PanelInstance[], id: string) => instances.some(instance => instance.inputs.some(input => input.from.startsWith(`${id}.`)));
export const declaredInstance = (id: string): PanelInstance => ({ id, source: { kind: 'declared', panel: id }, inputs: [], outputs: [] });

/** The save boundary for additions and their inputs/outputs. Layout and URL pins are owned elsewhere. */
export function buildSavedPanels(config: PanelConfiguration, step: Step): MenuViewPanels | null {
  if (config.kind !== 'custom') return null;
  const instances = config.added.filter(panel => step !== 4 || panel.slot !== 'trend').map(panel => panel.instance);
  return { version: 1, instances: [...instances, ...config.sources.filter(source => names(instances, source.id))] };
}

/** The source a new hold names: a kept one with the equipment output, or a new one under a free id. */
export function heldSourceFor(config: CustomPanels): { sources: readonly PanelInstance[]; id: string; added: boolean } {
  const kept = config.sources.find(source => source.outputs.some(output => output.key === heldOutput.key && output.dimension === heldOutput.dimension && output.shape === heldOutput.shape));
  if (kept) return { sources: config.sources, id: kept.id, added: false };
  const taken = new Set([...config.added.map(panel => panel.instance.id), ...config.sources.map(source => source.id)]);
  let id = HELD_SOURCE_ID;
  for (let n = 2; taken.has(id); n += 1) id = `${HELD_SOURCE_ID}-${n}`;
  const source: PanelInstance = { id, source: { kind: 'declared', panel: panelDeclarations.moduleMotions.id }, inputs: [], outputs: [heldOutput] };
  return { sources: [...config.sources, source], id, added: true };
}

/** Whether holding `id` would take the saved panels past the v1 limit; told before adding (#2862 R C2). */
export function holdOverflows(config: PanelConfiguration, step: Step, id: string): boolean {
  const custom = config.kind === 'custom' ? config : noPanels;
  const saved = buildSavedPanels(custom, step)?.instances.length ?? 0;
  const source = heldSourceFor(custom);
  const sourceSaved = !source.added && names(custom.added.map(panel => panel.instance), source.id);
  return saved + (custom.added.some(panel => panel.slot === id) ? 0 : 1) + (sourceSaved ? 0 : 1) > PANEL_INSTANCES_MAX;
}

/** Changing the drill step keeps the held tables (their values stand without the source chart, #2862 R C3) and resets the rest. */
export function keepHeld(config: PanelConfiguration): PanelConfiguration {
  if (config.kind !== 'custom') return defaultPanels;
  const added = config.added.flatMap(panel => holds(panel.instance) ? [{ slot: panel.slot, instance: panel.instance }] : []);
  return added.length ? { ...config, added } : defaultPanels;
}

/**
 * What one held table reads (#2862): each held input with the dimension its saved source output declares (R C6). `unread` is true when
 * an input names no output, keeps another key, or the shape is not the equipment set this table reads; the table then filters nothing.
 */
export function heldOf(instance: PanelInstance, instances: readonly PanelInstance[]) {
  const held: Record<string, HeldAnalysisSelection> = {};
  let unread = false;
  for (const input of instance.inputs) {
    if (input.mode !== 'hold') continue;
    const output = instances.flatMap(source => source.outputs.map(output => ({ ref: `${source.id}.${output.key}`, output }))).find(({ ref }) => ref === input.from)?.output;
    if (input.key !== heldOutput.key || !output) { unread = true; continue; }
    held[input.key] = { dimension: output.dimension, selection: input.value };
    if (output.dimension !== heldOutput.dimension || input.value.shape !== 'set') unread = true;
  }
  const selection = held[heldOutput.key]?.selection;
  return { held, unread, count: !unread && selection?.shape === 'set' ? selection.values.length : 0 };
}

