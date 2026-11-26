import { EQUIPMENT_SELECTION_DIMENSION, heldSelectionProblem, invalidMenuViewPanels, PANEL_INSTANCE_INPUTS_MAX, PANEL_INSTANCES_MAX, type AnalysisSelection, type MenuViewPanels, type PanelInstance, type PanelInstanceInput } from '@ap/contracts';
import type { AnalysisSelectionChip, HeldAnalysisSelection } from '@ap/kernel';
import { MOTION_EQUIPMENT_KEY } from '../../endpoints';
import { panelDeclarations } from './panelDeclaration';
import type { Step } from './stepped';

/** `heldFrom`: the drawn panel a held value came from, this session only; that panel cannot be hidden while it is held (#2862 R C7). */
export type AddedPanel = { slot: string; instance: PanelInstance; heldFrom?: string };
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
 * The selection source a held input names (#2862): the equipment bars the screen draws itself (the step's current bars or the added
 * «모듈 동작» panel). This menu saves it as an output-only instance with a reserved id, only while something holds it, so `from` names an
 * existing output. A restored one is recognised by the id, the «모듈 동작» declaration and no inputs, and is kept as it was saved (R C2).
 */
export const HELD_SOURCE_ID = 'held-source';
export const heldOutput = { key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' } as const;
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

/** HW Time's table declares equipment as a filter by default. Keep explicit highlight and the saved publisher. */
export function heldTableInput({ key, from, value, use }: Extract<PanelInstanceInput, { mode: 'hold' }>): PanelInstanceInput {
  return { key, from, mode: 'hold', value, ...(use === 'highlight' ? { use } : {}) };
}

function equipmentHold(sourceId: string, value: AnalysisSelection): PanelInstanceInput {
  const { key } = heldOutput;
  return heldTableInput({ key, from: `${sourceId}.${key}`, mode: 'hold', value });
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
export function buildSavedPanels(config: CustomPanels, step?: Step): MenuViewPanels;
export function buildSavedPanels(config: PanelConfiguration, step?: Step): MenuViewPanels | null;
export function buildSavedPanels(config: PanelConfiguration, step?: Step): MenuViewPanels | null {
  if (config.kind !== 'custom') return null;
  const instances = config.added.filter(({ slot, instance }) =>
    step !== 4 || slot !== 'trend' || instance.inputs.length > 0 || instance.outputs.length > 0).map(panel => panel.instance);
  return { version: 1, instances: [...instances, ...config.sources.filter(source => names(instances, source.id))] };
}

/** The source a new hold names: a kept one with the equipment output, or a new one under a free id. */
export function heldSourceFor(config: CustomPanels, { reservedOnly = false } = {}): { sources: readonly PanelInstance[]; id: string; added: boolean } {
  const kept = config.sources.find(source => (!reservedOnly || isHeldSource(source))
    && source.outputs.some(output => output.key === heldOutput.key && output.dimension === heldOutput.dimension && output.shape === heldOutput.shape));
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
function freeId(config: CustomPanels, base: string): string {
  const taken = new Set([...config.added.flatMap(panel => [panel.slot, panel.instance.id]), ...config.sources.map(source => source.id)]);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
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
    const value = intent.held[heldOutput.key];
    const inputs = value ? [equipmentHold(source.id, value)] : [];
    // With two following instances the later one holds, so the first keeps the address's row and page (R C5).
    const target = same.find(panel => holds(panel.instance)) ?? (room ? undefined : same.at(-1));
    if (target) return put({ ...target, instance: { ...target.instance, inputs }, heldFrom: intent.from }, target, source.sources);
    // A free id even for the first instance: a restored panel of another declaration may already use the declared one (R C9).
    const slot = freeId(custom, same.length ? `${id}-held` : id);
    return put({ slot, instance: { ...create(slot), inputs }, heldFrom: intent.from }, undefined, source.sources);
  }
  const following = same.find(panel => !holds(panel.instance));
  if (following) return { config: null, slot: following.slot };
  if (!same.length || (intent && room)) {
    const slot = id === 'table' ? freeId(custom, id) : id;
    return put({ slot, instance: create(slot) });
  }
  if (!intent) return { config: null, slot: same[0]!.slot };
  // With both table slots held, the later one follows its existing connection.
  const held = same.at(-1)!;
  return put(followPanel(held), held);
}

export function exceedsPanelLimit(panels: MenuViewPanels): boolean {
  return panels.instances.length > PANEL_INSTANCES_MAX;
}

const configurationToValidate = (config: CustomPanels, step: Step) => buildSavedPanels(config, config.connectionsEdited ? undefined : step);

/** Hold the targeted table in its current slot, materializing it if only a pin drew it. */
export function planTableHold(config: PanelConfiguration, step: Step, slot: string, chip: AnalysisSelectionChip, heldFrom?: string) {
  const { key, dimension, selection } = chip;
  if (key !== heldOutput.key || dimension !== heldOutput.dimension || selection.shape !== heldOutput.shape || heldSelectionProblem(selection)) {
    return { kind: 'refused', reason: 'heldEquipmentOnly' } as const;
  }
  const custom = config.kind === 'custom' ? config : noPanels;
  const target = custom.added.find(panel => panel.slot === slot);
  const instance = target?.instance ?? newPanelInstance(slot, panelDeclarations.table.id, [...custom.added.map(panel => panel.instance), ...custom.sources]);
  const source = heldSourceFor(custom);
  const inputs = [...instance.inputs.filter(input => input.key !== heldOutput.key), equipmentHold(source.id, selection)];
  const held: AddedPanel = { slot, heldFrom, instance: { ...instance, inputs } };
  const added = target ? custom.added.map(panel => panel === target ? held : panel) : [...custom.added, held];
  const next: CustomPanels = { ...custom, added, sources: source.sources };
  const candidate = configurationToValidate(next, step);
  if (exceedsPanelLimit(candidate)) return { kind: 'refused', reason: 'panelsFull' } as const;
  if (invalidMenuViewPanels(candidate)) {
    const reason = inputs.length > PANEL_INSTANCE_INPUTS_MAX ? 'heldInputsFull' : 'heldConfigurationInvalid';
    return { kind: 'refused', reason } as const;
  }
  return { kind: 'held', config: next } as const;
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
  const overflows = next !== null && exceedsPanelLimit(configurationToValidate(next, step));
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
  return { kind: 'custom', added: kept.map(({ slot, instance }) => ({ slot, instance })), sources: [...config.sources, ...named] };
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
