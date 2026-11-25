import { isRecord } from '../guards.js';

/**
 * Stored chart settings (ADR-0176): kind, field mapping and options only. Data, functions and visual values (hex, px, fonts)
 * cannot be expressed: every object is closed, colours are series token names, number display is a format descriptor.
 * `resolve(config, rows, fieldMeta)` in @ap/components turns it into drawing input.
 */
export const CHART_CONFIG_COLORS = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'] as const;
export type ChartConfigColor = (typeof CHART_CONFIG_COLORS)[number];
/** One measure field drawn as a series. Without `color` the series takes the next series token in order. */
export type ChartConfigMeasure = { field: string; color?: ChartConfigColor; axis?: 'left' | 'right' };
/** Number display descriptor, never a function: `percent` treats 0.25 as 25%. */
export type ChartValueFormat = { kind: 'number' | 'percent'; decimals?: number };
export type ChartConfig = {
  version: 1;
  kind: 'line' | 'bar';
  x: { field: string; type: 'time' | 'category' };
  measures: ChartConfigMeasure[];
  /** One series per value of this dimension field; then exactly one measure. */
  split?: { field: string };
  /** `horizontal`: bar charts on a category axis only. */
  orientation?: 'vertical' | 'horizontal';
  stack?: 'none' | 'stack' | 'percent';
  /** Line charts only. */
  areaFill?: boolean;
  valueFormat?: ChartValueFormat;
};

export const CHART_CONFIG_MEASURES_MAX = 8;
export const CHART_CONFIG_FIELD_MAX = 200;
export const CHART_CONFIG_DECIMALS_MAX = 6;

const KEYS = ['version', 'kind', 'x', 'measures', 'split', 'orientation', 'stack', 'areaFill', 'valueFormat'];

function closed(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key));
}

const field = (value: unknown) => typeof value === 'string' && /\S/.test(value) && value.length <= CHART_CONFIG_FIELD_MAX;
const fieldRule = `must be a non-blank string of at most ${CHART_CONFIG_FIELD_MAX} characters`;
const oneOf = (value: unknown, values: readonly unknown[]) => values.includes(value);

/** Null when `raw` is a ChartConfig v1, else the first reason. The wire schema in @ap/contract-schemas mirrors these rules. */
export function invalidChartConfig(raw: unknown, path = 'config'): string | null {
  if (!isRecord(raw)) return `${path} must be an object`;
  const unknown = Object.keys(raw).find(key => !KEYS.includes(key));
  if (unknown !== undefined) return `${path}.${unknown} is not a chart config key`;
  if (raw.version !== 1) return `${path}.version must be 1`;
  if (!oneOf(raw.kind, ['line', 'bar'])) return `${path}.kind must be line or bar`;
  const { x, measures, split, valueFormat } = raw;
  if (!closed(x, ['field', 'type'])) return `${path}.x must contain field and type`;
  if (!field(x.field)) return `${path}.x.field ${fieldRule}`;
  if (!oneOf(x.type, ['time', 'category'])) return `${path}.x.type must be time or category`;
  if (!Array.isArray(measures) || measures.length < 1 || measures.length > CHART_CONFIG_MEASURES_MAX) {
    return `${path}.measures must contain 1 to ${CHART_CONFIG_MEASURES_MAX} measures`;
  }
  for (const [i, measure] of measures.entries()) {
    const at = `${path}.measures[${i}]`;
    if (!closed(measure, ['field'], ['color', 'axis'])) return `${at} must contain field and only color or axis`;
    if (!field(measure.field)) return `${at}.field ${fieldRule}`;
    if ('color' in measure && !oneOf(measure.color, CHART_CONFIG_COLORS)) return `${at}.color must be a series token name`;
    if ('axis' in measure && !oneOf(measure.axis, ['left', 'right'])) return `${at}.axis must be left or right`;
  }
  if ('split' in raw && (!closed(split, ['field']) || !field(split.field))) return `${path}.split.field ${fieldRule}`;
  if ('orientation' in raw && !oneOf(raw.orientation, ['vertical', 'horizontal'])) return `${path}.orientation must be vertical or horizontal`;
  if ('stack' in raw && !oneOf(raw.stack, ['none', 'stack', 'percent'])) return `${path}.stack must be none, stack or percent`;
  if ('areaFill' in raw && typeof raw.areaFill !== 'boolean') return `${path}.areaFill must be a boolean`;
  if ('valueFormat' in raw) {
    if (!closed(valueFormat, ['kind'], ['decimals']) || !oneOf(valueFormat.kind, ['number', 'percent'])) {
      return `${path}.valueFormat must be a number or percent format`;
    }
    const { decimals } = valueFormat;
    if ('decimals' in valueFormat && !(Number.isInteger(decimals) && (decimals as number) >= 0 && (decimals as number) <= CHART_CONFIG_DECIMALS_MAX)) {
      return `${path}.valueFormat.decimals must be an integer from 0 to ${CHART_CONFIG_DECIMALS_MAX}`;
    }
  }
  return invalidCombination(raw as ChartConfig, path);
}

/** Cross-field rules, run after the shape is known to be valid. Same order and messages as the wire schema. */
function invalidCombination(config: ChartConfig, path: string): string | null {
  const fields = config.measures.map(measure => measure.field);
  if (new Set(fields).size !== fields.length) return `${path}.measures fields must be distinct`;
  if (config.split && config.measures.length !== 1) return `${path}.split needs exactly one measure`;
  if (config.orientation === 'horizontal' && (config.kind !== 'bar' || config.x.type !== 'category')) {
    return `${path}.orientation horizontal needs a bar chart on a category axis`;
  }
  if (config.areaFill === true && config.kind !== 'line') return `${path}.areaFill needs a line chart`;
  const stacked = config.stack !== undefined && config.stack !== 'none';
  if (config.measures.some(measure => measure.axis === 'right') && (stacked || config.orientation === 'horizontal')) {
    return `${path}.measures axis right needs a vertical, unstacked chart`;
  }
  return null;
}
