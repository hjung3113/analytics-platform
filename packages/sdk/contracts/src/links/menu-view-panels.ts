import { isRecord } from '../guards.js';
import type { AnalysisSelection, AnalysisSelectionShape } from '../menu/panels.js';
import { CUSTOM_GROUP_FIXED_MAX } from './custom-group.js';
import { forbiddenKey, nonSerializable } from './saved-view-json.js';
import type { JsonValue } from './saved-view.js';

/** One input of a panel instance: which instance output it reads and how (ADR-0176). */
export type PanelInstanceInput =
  /** 따라가기: reads the current selection of `from` (`<instance id>.<output key>`). */
  | { key: string; from: string; mode: 'follow' }
  /** 붙잡기: keeps the selection `from` had when it was held. The value is stored as is: a range is the absolute wall-clock
   *  `from`/`to` pair of the selection, never a relative period (#2760, owner 2026-11-25). */
  | { key: string; from: string; mode: 'hold'; value: AnalysisSelection };
export type PanelInstanceOutput = { key: string; dimension: string; shape: AnalysisSelectionShape };
export type PanelInstanceSource =
  /** A code panel of this menu (`panel` = its declaration id) or a lent panel (`panel` = `<menuId>/<panelId>`, PanelBinding.source). */
  | { kind: 'declared'; panel: string }
  /** A panel made from settings. `config` is the stored ChartConfig; its shape belongs to #2745 and is opaque JSON here. */
  | { kind: 'chart'; config: { [key: string]: JsonValue } };
export type PanelInstance = { id: string; source: PanelInstanceSource; inputs: PanelInstanceInput[]; outputs: PanelInstanceOutput[] };
/** `MenuView.panels` v1. The docking arrangement stays in `MenuView.layout` and refers to instance ids. */
export type MenuViewPanels = { version: 1; instances: PanelInstance[] };

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
    if (!isRecord(source.config)) return `${path}.source.config must be a JSON object`;
  } else return `${path}.source must declare a panel or chart config`;

  if (!Array.isArray(inputs) || inputs.length > PANEL_INSTANCE_INPUTS_MAX) return `${path}.inputs must be an array of at most ${PANEL_INSTANCE_INPUTS_MAX} inputs`;
  if (!Array.isArray(outputs) || outputs.length > PANEL_INSTANCE_INPUTS_MAX) return `${path}.outputs must be an array of at most ${PANEL_INSTANCE_INPUTS_MAX} outputs`;
  for (const [i, input] of inputs.entries()) {
    const inputPath = `${path}.inputs[${i}]`;
    if (hasFields(input, ['key', 'from', 'mode', 'value']) && input.mode === 'hold') {
      const bad = invalidHeldSelection(input.value, `${inputPath}.value`);
      if (bad) return bad;
    } else if (!hasFields(input, ['key', 'from', 'mode']) || input.mode !== 'follow') {
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
      const ref = `${instance.id}.${output.key}`;
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
      upstream.push(output.id);
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
  return instances.some(({ id }) => hasCycle(id)) ? 'panels connections must not contain a cycle' : null;
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

/** Chart instances follow the same key rule as saved chart options. Call after validating the panel shape. */
export function forbiddenChartConfigKey(panels: unknown): string | null {
  if (panels === null) return null;
  for (const [i, instance] of (panels as MenuViewPanels).instances.entries()) {
    if (instance.source.kind !== 'chart') continue;
    const bad = forbiddenKey(instance.source.config, `panels.instances[${i}].source.config`);
    if (bad) return bad;
  }
  return null;
}

export function readMenuViewPanels(raw: unknown): { status: 'default' } | { status: 'ok'; panels: MenuViewPanels } | { status: 'legacy'; reason: 'unreadable' } {
  if (raw === null || raw === undefined) return { status: 'default' };
  try {
    if (invalidMenuViewPanels(raw) === null && nonSerializable(raw, 'panels', [], { requireDenseArrays: true }) === null && forbiddenChartConfigKey(raw) === null) {
      return { status: 'ok', panels: raw as MenuViewPanels };
    }
  } catch {
    // A value whose properties cannot be inspected is unreadable too.
  }
  return { status: 'legacy', reason: 'unreadable' };
}
