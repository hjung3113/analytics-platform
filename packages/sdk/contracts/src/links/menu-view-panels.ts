import { isRecord } from '../guards.js';
import type { AnalysisSelection, AnalysisSelectionShape } from '../menu/panels.js';
import { invalidChartConfig, type ChartConfig } from './chart-config.js';
import { CUSTOM_GROUP_FIXED_MAX } from './custom-group.js';
import { nonSerializable } from './saved-view-json.js';

/** One input of a panel instance: which instance output it reads and how (ADR-0176). */
export type PanelInstanceInput = {
  /** Receiving mode. Omit to use the declaration's input selection, or omit the input itself to ignore it. */
  use?: 'filter' | 'highlight';
} & (
  /** 따라가기: reads the current selection of `from` (`<instance id>.<output key>`). */
  | { key: string; from: string; mode: 'follow' }
  /** 붙잡기: keeps the selection `from` had when it was held. The value is stored as is: a range is the absolute wall-clock
   *  `from`/`to` pair of the selection, never a relative period (#2760, owner 2026-11-25). */
  | { key: string; from: string; mode: 'hold'; value: AnalysisSelection }
);
export type PanelInstanceOutput = { key: string; dimension: string; shape: AnalysisSelectionShape };
export type PanelInstanceSource =
  /** A code panel of this menu (`panel` = its declaration id) or a lent panel (`panel` = `<menuId>/<panelId>`, PanelBinding.source). */
  | { kind: 'declared'; panel: string }
  /** A panel made from settings: the stored ChartConfig v1 (#2745), closed, so it never carries data or visual values. */
  | { kind: 'chart'; config: ChartConfig };
export type PanelInstance = { id: string; source: PanelInstanceSource; inputs: PanelInstanceInput[]; outputs: PanelInstanceOutput[] };
/** `MenuView.panels` v1. The docking arrangement stays in `MenuView.layout` and refers to instance ids. */
export type MenuViewPanels = { version: 1; instances: PanelInstance[] };

/** The `from` reference of an instance output, `<instance id>.<output key>` (ADR-0176). Instance ids never contain ".", so the first "." splits it. Build every reference with this, never by hand. */
export function panelOutputRef(instanceId: string, key: string): string {
  return `${instanceId}.${key}`;
}

export const PANEL_INSTANCES_MAX = 24;
export const PANEL_INSTANCE_INPUTS_MAX = 16;
export const PANEL_INSTANCE_TOKEN_MAX = 200;

function hasFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every(field => keys.includes(field));
}

const nonBlank = (value: unknown): value is string => typeof value === 'string' && /\S/.test(value);
const token = (value: unknown) => nonBlank(value) && value.length <= PANEL_INSTANCE_TOKEN_MAX;
const tokenRule = `must be a non-blank string of at most ${PANEL_INSTANCE_TOKEN_MAX} characters`;

/**
 * Why a held selection value cannot be applied, or null (#2862): exactly the saved-view rule (a set of 1–5,000 distinct non-blank
 * strings, or a range of non-blank ends), so what saves also applies. Range order and calendar validity belong to the dimension.
 */
export function heldSelectionProblem(value: unknown): string | null {
  return invalidHeldSelection(value, 'value');
}

function invalidHeldSelection(value: unknown, path: string): string | null {
  if (hasFields(value, ['shape', 'from', 'to']) && value.shape === 'range') {
    if (!nonBlank(value.from)) return `${path}.from must be non-blank`;
    if (!nonBlank(value.to)) return `${path}.to must be non-blank`;
    return null;
  }
  if (hasFields(value, ['shape', 'values']) && value.shape === 'set') {
    const { values } = value;
    if (!Array.isArray(values) || values.length < 1 || values.length > CUSTOM_GROUP_FIXED_MAX) {
      return `${path}.values must contain 1 to ${CUSTOM_GROUP_FIXED_MAX} values`;
    }
    for (const item of values) if (!nonBlank(item)) return `${path}.values must contain non-blank strings`;
    return new Set(values).size === values.length ? null : `${path}.values must be distinct`;
  }
  return `${path} must be a set or range selection`;
}

function invalidInstance(value: unknown, path: string): string | null {
  if (!hasFields(value, ['id', 'source', 'inputs', 'outputs'])) return `${path} must contain id, source, inputs and outputs`;
  if (!token(value.id)) return `${path}.id ${tokenRule}`;
  const { source, inputs, outputs } = value;
  if (hasFields(source, ['kind', 'panel']) && source.kind === 'declared') {
    if (!token(source.panel)) return `${path}.source.panel ${tokenRule}`;
  } else if (hasFields(source, ['kind', 'config']) && source.kind === 'chart') {
    const bad = invalidChartConfig(source.config, `${path}.source.config`);
    if (bad) return bad;
  } else return `${path}.source must declare a panel or chart config`;

  if (!Array.isArray(inputs) || inputs.length > PANEL_INSTANCE_INPUTS_MAX) return `${path}.inputs must be an array of at most ${PANEL_INSTANCE_INPUTS_MAX} inputs`;
  if (!Array.isArray(outputs) || outputs.length > PANEL_INSTANCE_INPUTS_MAX) return `${path}.outputs must be an array of at most ${PANEL_INSTANCE_INPUTS_MAX} outputs`;
  for (const [i, input] of inputs.entries()) {
    const inputPath = `${path}.inputs[${i}]`;
    const fields = ['key', 'from', 'mode'];
    if (isRecord(input) && Object.hasOwn(input, 'use')) {
      if (input.use !== 'filter' && input.use !== 'highlight') return `${inputPath}.use must be filter or highlight`;
      fields.push('use');
    }
    if (hasFields(input, [...fields, 'value']) && input.mode === 'hold') {
      const bad = invalidHeldSelection(input.value, `${inputPath}.value`);
      if (bad) return bad;
    } else if (!hasFields(input, fields) || input.mode !== 'follow') {
      return `${inputPath} must be a follow or hold input`;
    }
    if (!token(input.key)) return `${inputPath}.key ${tokenRule}`;
    if (typeof input.from !== 'string') return `${inputPath}.from must be a string`;
  }
  for (const [i, output] of outputs.entries()) {
    const outputPath = `${path}.outputs[${i}]`;
    if (!hasFields(output, ['key', 'dimension', 'shape'])) return `${outputPath} must contain key, dimension and shape`;
    if (!token(output.key)) return `${outputPath}.key ${tokenRule}`;
    if (!token(output.dimension)) return `${outputPath}.dimension ${tokenRule}`;
    if (output.shape !== 'set' && output.shape !== 'range') return `${outputPath}.shape must be set or range`;
  }
  return null;
}

/** Runs after shape and size validation. The wire schema mirrors these rules and messages. */
function invalidPanelConnections(instances: PanelInstance[]): string | null {
  const ids = new Set<string>();
  const outputs = new Map<string, { id: string; shape: AnalysisSelectionShape }>();
  for (const instance of instances) {
    if (instance.id.includes('.')) return 'panels instance ids must not contain "."';
    if (ids.has(instance.id)) return 'panels instance ids must be unique';
    ids.add(instance.id);
    for (const output of instance.outputs) {
      const ref = panelOutputRef(instance.id, output.key);
      if (outputs.has(ref)) return 'panels output keys must be unique per instance';
      outputs.set(ref, { id: instance.id, shape: output.shape });
    }
    if (new Set(instance.inputs.map(input => input.key)).size !== instance.inputs.length) {
      return 'panels input keys must be unique per instance';
    }
  }

  const dependencies = new Map<string, string[]>();
  for (const { id, inputs } of instances) {
    const upstream: string[] = [];
    for (const input of inputs) {
      const output = outputs.get(input.from);
      if (!output) return 'panels input from must name an existing instance output';
      if (output.id === id) return 'panels input from must not name its own instance';
      if (input.mode === 'hold' && input.value.shape !== output.shape) {
        return 'panels held selection shape must match the referenced output';
      }
      // Stored validation cannot see declarations. Count omitted use as filter, the default receiving mode.
      if (!Object.hasOwn(input, 'use') || input.use === 'filter') upstream.push(output.id);
    }
    dependencies.set(id, upstream);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (dependencies.get(id)?.some(hasCycle)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return instances.some(({ id }) => hasCycle(id)) ? 'panels connections must not contain a filter cycle' : null;
}

export function invalidMenuViewPanels(raw: unknown): string | null {
  if (!hasFields(raw, ['version', 'instances'])) return 'panels must contain version and instances';
  if (raw.version !== 1) return 'panels version must be 1';
  if (!Array.isArray(raw.instances) || raw.instances.length > PANEL_INSTANCES_MAX) {
    return `panels.instances must be an array of at most ${PANEL_INSTANCES_MAX} instances`;
  }
  for (const [i, instance] of raw.instances.entries()) {
    const bad = invalidInstance(instance, `panels.instances[${i}]`);
    if (bad) return bad;
  }
  return invalidPanelConnections(raw.instances as PanelInstance[]);
}

export function readMenuViewPanels(raw: unknown): { status: 'default' } | { status: 'ok'; panels: MenuViewPanels } | { status: 'legacy'; reason: 'unreadable' } {
  if (raw === null || raw === undefined) return { status: 'default' };
  try {
    if (invalidMenuViewPanels(raw) === null && nonSerializable(raw, 'panels', [], { requireDenseArrays: true }) === null) {
      return { status: 'ok', panels: raw as MenuViewPanels };
    }
  } catch {
    // A value whose properties cannot be inspected is unreadable too.
  }
  return { status: 'legacy', reason: 'unreadable' };
}

/**
 * Panels of a view opened in another Scope than it was saved in (#2862, owner 2026-11-25): a held `set` (equipment and other members of that
 * Scope) is not applied there and the input follows the current selection instead; a held range is an absolute wall-clock pair and stays.
 * `keys` lists the changed input keys once each, for the «다른 Scope라 제외» notice. Panels with no held set come back as the same object.
 */
export function followHeldSets(panels: MenuViewPanels): { panels: MenuViewPanels; keys: string[] } {
  const keys = new Set<string>();
  const instances = panels.instances.map(instance => instance.inputs.some(input => input.mode === 'hold' && input.value.shape === 'set')
    ? { ...instance, inputs: instance.inputs.map((input): PanelInstanceInput => {
      if (input.mode !== 'hold' || input.value.shape !== 'set') return input;
      keys.add(input.key);
      const { key, from, use } = input;
      return { key, from, mode: 'follow', ...(use ? { use } : {}) };
    }) }
    : instance);
  return keys.size === 0 ? { panels, keys: [] } : { panels: { ...panels, instances }, keys: [...keys] };
}
