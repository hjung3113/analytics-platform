import { EQUIPMENT_SELECTION_DIMENSION, PANEL_INSTANCES_MAX, type AnalysisSelection, type MenuViewPanels, type PanelInstance, type PanelInstanceInput, type PanelInstanceOutput } from '@ap/contracts';
import type { HeldAnalysisSelection } from '@ap/kernel';
import { MOTION_EQUIPMENT_KEY } from '../../endpoints';
import { panelDeclarations } from './panelDeclaration';
import { CATALOG_IDS, type Step } from './stepped';

/**
 * `heldFrom` keeps the drawn source visible while the table holds (#2862 R C7).
 * `implicitFollow` follows the current publisher while an added table is a draft; saved inputs are explicit.
 */
export type AddedPanel = { slot: string; instance: PanelInstance; heldFrom?: string; implicitFollow?: true };
export type PanelConfiguration =
  | { kind: 'default' | 'unreadable' }
  /** `sources`: the output-only instances held inputs name, kept as restored and never drawn (#2862). */
  | { kind: 'custom'; added: readonly AddedPanel[]; sources: readonly PanelInstance[]; connectionsEdited?: true };
export const defaultPanels: PanelConfiguration = { kind: 'default' };
export type CustomPanels = Extract<PanelConfiguration, { kind: 'custom' }>;
export const noPanels: CustomPanels = { kind: 'custom', added: [], sources: [] };
/** How a panel is added: from the toolbar or a pin (no intent) an open panel keeps its inputs; «새 패널» states follow or hold (#2862 R C5). */
export type AddIntent = { mode: 'follow' } | { mode: 'hold'; held: Readonly<Record<string, AnalysisSelection>>; from?: string };

/**
 * The output-only equipment channel for a hold (#2862) or for a default follow without a drawn chart.
 * It is saved while an input names it. A restored source is recognised by the reserved id, the «모듈 동작» declaration and no inputs.
 */
export const HELD_SOURCE_ID = 'held-source';
export const heldOutput = { key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' } as const;
export const isEquipmentOutput = (output: PanelInstanceOutput) =>
  output.key === heldOutput.key && output.dimension === heldOutput.dimension && output.shape === heldOutput.shape;
export const isHeldSource = (instance: PanelInstance) => (instance.id === HELD_SOURCE_ID || instance.id.startsWith(`${HELD_SOURCE_ID}-`))
  && instance.source.kind === 'declared' && instance.source.panel === panelDeclarations.moduleMotions.id && instance.inputs.length === 0
  // A «모듈 동작» chart saved under such an id but with no equipment output is drawn as a chart (R2 C2).
  && instance.outputs.some(output => output.key === heldOutput.key);
export const holds = (instance: PanelInstance) => instance.inputs.some(input => input.mode === 'hold');
export const names = (instances: readonly PanelInstance[], id: string) => instances.some(instance => instance.inputs.some(input => input.from.startsWith(`${id}.`)));

export function newPanelInstance(slot: string, panel: string, instances: readonly PanelInstance[]): PanelInstance {
  const occupied = new Set(instances.map(instance => instance.id));
  let id = slot;
  for (let n = 1; occupied.has(id); n += 1) id = `${slot}~${n}`;
  return { id, source: { kind: 'declared', panel }, inputs: [], outputs: [] };
}

export function declaredPanelId(instance: PanelInstance): string | undefined {
  return instance.source.kind === 'declared' ? instance.source.panel : undefined;
}

export function instancePanelSlot(instance: PanelInstance): string {
  const panel = declaredPanelId(instance);
  if (instance.id === 'current' && panel === panelDeclarations.moduleMotions.id) return 'current';
  if (instance.id === panel && CATALOG_IDS.some(id => id === panel)) return panel;
  // Escape UTF-16 code units to preserve opaque IDs without case folding or collisions.
  const encoded = instance.id.replace(/[^a-z0-9_-]/g, unit => `.${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `saved-instance-${encoded}`;
}

/** HW Time's table declares equipment as a filter by default. Keep explicit highlight and the saved publisher. */
export function heldTableInput({ key, from, value, use }: Extract<PanelInstanceInput, { mode: 'hold' }>): PanelInstanceInput {
  return { key, from, mode: 'hold', value, ...(use === 'highlight' ? { use } : {}) };
}

export function followPanel({ slot, instance }: AddedPanel): AddedPanel {
  const inputs = instance.inputs.map((input): PanelInstanceInput => {
    if (input.mode === 'follow') return input;
    const { key, from, use } = input;
    return { key, from, mode: 'follow', ...(use ? { use } : {}) };
  });
  return { slot, instance: { ...instance, inputs } };
}

/** Project the saved panels for one step. Omit the step to validate a configuration carried across drills. */
export function buildSavedPanels(config: CustomPanels, step?: Step, publisher?: PanelInstance): MenuViewPanels;
export function buildSavedPanels(config: PanelConfiguration, step?: Step, publisher?: PanelInstance): MenuViewPanels | null;
export function buildSavedPanels(config: PanelConfiguration, step?: Step, publisher?: PanelInstance): MenuViewPanels | null {
  if (config.kind !== 'custom') return null;
  const instances = config.added.flatMap(({ slot, instance, implicitFollow }) => {
    if (step === 4 && slot === 'trend' && !instance.inputs.length && !instance.outputs.length) return [];
    return [implicitFollow && publisher ? { ...instance, inputs: [defaultTableInput(publisher)] } : instance];
  });
  if (publisher && names(instances, publisher.id) && !config.sources.some(source => source.id === publisher.id)) {
    const existing = instances.findIndex(instance => instance.id === publisher.id);
    if (existing < 0) instances.push(publisher);
    else instances[existing] = publisher;
  }
  return { version: 1, instances: [...instances, ...config.sources.filter(source => names(instances, source.id))] };
}

export function defaultTableInput(source: PanelInstance): PanelInstanceInput {
  return { key: heldOutput.key, from: `${source.id}.${heldOutput.key}`, mode: 'follow' };
}

/** The source a new hold names: a kept one with the equipment output, or a new one under a free id. */
export function heldSourceFor(config: CustomPanels, { reservedOnly = false } = {}): { sources: readonly PanelInstance[]; id: string; added: boolean } {
  const kept = config.sources.find(source => (!reservedOnly || isHeldSource(source))
    && source.outputs.some(isEquipmentOutput));
  if (kept) return { sources: config.sources, id: kept.id, added: false };
  const taken = new Set([...config.added.map(panel => panel.instance.id), ...config.sources.map(source => source.id)]);
  let id = HELD_SOURCE_ID;
  for (let n = 2; taken.has(id); n += 1) id = `${HELD_SOURCE_ID}-${n}`;
  const source: PanelInstance = { id, source: { kind: 'declared', panel: panelDeclarations.moduleMotions.id }, inputs: [], outputs: [heldOutput] };
  return { sources: [...config.sources, source], id, added: true };
}

/** Instances of one declared panel this menu may open side by side: the following one and the held one, to compare before and after (#2862 ②). */
export const SAME_PANEL_MAX = 2;
const ofPanel = (config: CustomPanels, id: string) => config.added.filter(({ instance }) => instance.source.kind === 'declared' && instance.source.panel === id);

/** A new raw table uses its eventual restore slot before it is saved or materialized by settings. */
export function newTablePanel(config: CustomPanels, base = 'table'): AddedPanel {
  const taken = new Set([...config.added.flatMap(panel => [panel.slot, panel.instance.id]), ...config.sources.map(source => source.id)]);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  const instance: PanelInstance = { id, source: { kind: 'declared', panel: 'table' }, inputs: [], outputs: [] };
  return { slot: instancePanelSlot(instance), instance };
}

/**
 * The configuration after adding declared panel `id`, and the slot it opened or changed (`config` null: nothing changes, reveal `slot`).
 * From the toolbar or a pin (no intent) an open panel keeps its inputs. «새 패널» states the mode (#2862):
 * - hold: an open held instance takes the new values; with only a following one open, a second instance holds them beside it (②);
 * - follow: an open following instance is revealed; with only a held one open, a second instance follows beside it (②).
 * With no room for a second instance, the panel's own slot changes mode (R C5).
 */
export function withAdded(config: PanelConfiguration, id: string, step: Step, intent?: AddIntent): { config: CustomPanels | null; slot: string } {
  if (step === 4 && id === 'trend') return { config: null, slot: id };
  const custom = config.kind === 'custom' ? config : noPanels;
  const all = id === 'table' ? ofPanel(custom, id) : custom.added.filter(panel => panel.slot === id);
  // Only the first two open; a saved third waits for removal and is never the one changed (R2 C13).
  const same = all.slice(0, SAME_PANEL_MAX);
  const put = (panel: AddedPanel, replaced?: AddedPanel, sources = custom.sources) => ({ slot: panel.slot, config: { ...custom, sources,
    added: replaced ? custom.added.map(item => item === replaced ? panel : item) : [...custom.added, panel] } });
  const create = (slot: string) => newPanelInstance(slot, id, [...custom.added.map(panel => panel.instance), ...custom.sources]);
  const room = id === 'table' && all.length < SAME_PANEL_MAX;
  if (intent?.mode === 'hold') {
    const source = heldSourceFor(custom);
    const inputs = Object.entries(intent.held).flatMap(([key, value]) => key === heldOutput.key
      ? [heldTableInput({ key, from: `${source.id}.${key}`, mode: 'hold', value })] : []);
    // With two following instances the later one holds, so the first keeps the address's row and page (R C5).
    const target = same.find(panel => holds(panel.instance)) ?? (room ? undefined : same.at(-1));
    if (target) return put({ slot: target.slot, instance: { ...target.instance, inputs }, heldFrom: intent.from }, target, source.sources);
    // A free id even for the first instance: a restored panel of another declaration may already use the declared one (R C9).
    const table = newTablePanel(custom, same.length ? `${id}-held` : id);
    return put({ ...table, instance: { ...table.instance, inputs }, heldFrom: intent.from }, undefined, source.sources);
  }
  const following = same.find(panel => !holds(panel.instance));
  if (following) return { config: null, slot: following.slot };
  if (!same.length || (intent && room)) {
    return put(id === 'table' ? { ...newTablePanel(custom), implicitFollow: true } : { slot: id, instance: create(id) });
  }
  if (!intent) return { config: null, slot: same[0]!.slot };
  // With both table slots held, the later one follows its existing connection.
  const held = same.at(-1)!;
  return put(followPanel(held), held);
}

export function exceedsPanelLimit(panels: MenuViewPanels): boolean {
  return panels.instances.length > PANEL_INSTANCES_MAX;
}

export function panelAdditionOverflows(config: PanelConfiguration, step: Step, id: string, intent?: AddIntent): boolean {
  return planAdd(config, id, step, intent).overflows;
}

/**
 * One add as the screen will apply it: `materialize` first gives a panel shown only by a pin its own instance (so a second can sit beside it).
 * Count what would be saved, including required sources. A configuration carried across drills must fit at every step (#2999 C1).
 */
export function planAdd(config: PanelConfiguration, id: string, step: Step, intent?: AddIntent, materialize = false): { config: CustomPanels | null; slot: string; overflows: boolean } {
  // The panel a pin shows is the following one, also beside a held table (R2 C11).
  const base = materialize ? withAdded(config, id, step, { mode: 'follow' }).config : null;
  const added = withAdded(base ?? config, id, step, intent);
  const next = added.config ?? base;
  const overflows = next !== null && exceedsPanelLimit(buildSavedPanels(next, next.connectionsEdited ? undefined : step));
  return { config: next, slot: added.slot, overflows };
}

/**
 * Changing the drill step keeps the held tables (their values stand without the source chart, #2862 R C3) and resets the rest. A drawn panel a
 * held input names stays as a hidden source, so the saved graph keeps a valid `from` (R2 C3).
 */
export function keepHeld(config: PanelConfiguration): PanelConfiguration {
  if (config.kind !== 'custom') return defaultPanels;
  // A held table past the two that open stays behind with the rest (R2 C13).
  const kept = config.added.filter(panel => holds(panel.instance) && (panel.instance.source.kind !== 'declared'
    || ofPanel(config, panel.instance.source.panel).indexOf(panel) < SAME_PANEL_MAX));
  if (!kept.length) return defaultPanels;
  const keptInstances = kept.map(panel => panel.instance);
  const named = config.added.filter(panel => !holds(panel.instance) && names(keptInstances, panel.instance.id)).map(panel => panel.instance);
  return { ...config, added: kept.map(({ slot, instance }) => ({ slot, instance })), sources: [...config.sources, ...named] };
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
