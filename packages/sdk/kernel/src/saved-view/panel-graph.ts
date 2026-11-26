import { panelOutputRef, type AnalysisSelection, type PanelInstance, type PanelInstanceInput } from '@ap/contracts';
import type { HeldAnalysisSelection } from '../context/analysisSelection';

/**
 * Domain-free pieces of a saved panel graph (`MenuViewPanels` v1, #3164): ids, follow and hold inputs, and what a held input reads.
 * A menu keeps only its own choices (which output key, which dimension, which declared panels) and builds its graph from these.
 */

/**
 * The first free id: `base`, else `base-2`, `base-3`, …
 * `taken` must hold every name the graph already uses: instance ids, kept sources and the slots panels are mounted in,
 * so one allocator never hands out a name another part of the graph already means.
 */
export function freePanelId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** 따라가기: read the current selection of `sourceId`'s output `key`. */
export function followInput(sourceId: string, key: string, use?: PanelInstanceInput['use']): PanelInstanceInput {
  return { key, from: panelOutputRef(sourceId, key), mode: 'follow', ...(use ? { use } : {}) };
}

/** 붙잡기: keep `value`, the selection `sourceId`'s output `key` had when it was held. */
export function holdInput(sourceId: string, key: string, value: AnalysisSelection, use?: PanelInstanceInput['use']): PanelInstanceInput {
  return { key, from: panelOutputRef(sourceId, key), mode: 'hold', value, ...(use ? { use } : {}) };
}

/** Whether the instance keeps at least one held selection. */
export const holdsSelection = (instance: PanelInstance) => instance.inputs.some(input => input.mode === 'hold');

/** «따라가기로 바꾸기»: every held input follows its source again, keeping its key, source and receiving mode. */
export function followInstead(instance: PanelInstance): PanelInstance {
  if (!holdsSelection(instance)) return instance;
  return { ...instance, inputs: instance.inputs.map((input): PanelInstanceInput => {
    if (input.mode === 'follow') return input;
    const { key, from, use } = input;
    return { key, from, mode: 'follow', ...(use ? { use } : {}) };
  }) };
}

/** Whether any of `instances` reads an output of instance `id`. */
export const namesInstance = (instances: readonly PanelInstance[], id: string) =>
  instances.some(instance => instance.inputs.some(input => input.from.startsWith(`${id}.`)));

/**
 * What the held inputs of `instance` read: each held value with the dimension its source output declares, by input key.
 * `unresolved` lists the keys whose `from` names no output of `instances`; they hold nothing a reader can use.
 */
export function resolveHeldInputs(instance: PanelInstance, instances: readonly PanelInstance[]): { held: Record<string, HeldAnalysisSelection>; unresolved: string[] } {
  const outputs = new Map(instances.flatMap(source => source.outputs.map(output => [panelOutputRef(source.id, output.key), output] as const)));
  const held: Record<string, HeldAnalysisSelection> = {};
  const unresolved: string[] = [];
  for (const input of instance.inputs) {
    if (input.mode !== 'hold') continue;
    const output = outputs.get(input.from);
    if (!output) { unresolved.push(input.key); continue; }
    held[input.key] = { dimension: output.dimension, selection: input.value };
  }
  return { held, unresolved };
}
