import { CHART_CONFIG_COLORS, canClientSum, formatNumber, wallClockEpochMs, type ChartConfig, type ChartValueFormat, type Reaggregation } from '@ap/contracts';
import type { AnalysisChartFrameProps, ChartSeries } from './AnalysisChartFrame';

/** What the menu knows about one field of its rows: display name, unit and, for measures, how values may be recombined. */
export type ChartFieldMeta = { label: string; unit?: string; reaggregation?: Reaggregation; metricVersion?: string };
/** One row of the query answer the config maps. Missing or null values are unknown, never 0. */
export type ChartConfigRow = Readonly<Record<string, string | number | null | undefined>>;

/** The Chart Frame props a config decides. Identity, title, trust and callbacks stay with the menu. */
export type ResolvedChartFrame = Pick<AnalysisChartFrameProps, 'series' | 'unit' | 'xType' | 'orientation' | 'stackMode' | 'areaFill' | 'reaggregation' | 'valueFormat' | 'rightAxis' | 'metricVersion'>;

/**
 * Why a valid config cannot be drawn from these rows and fields. The menu shows its own words; nothing is repaired.
 * - `unknown-field`: the field has no meta (renamed or removed from the dataset).
 * - `missing-unit`: a plotted measure has no display unit. A dimensionless measure declares one anyway (`배`, `건`, `ratio`); a percent format shows `%`.
 * - `mixed-units`: measures on one axis have different units; `field` is the first that differs from that axis' first measure.
 * - `not-additive`: `stack` asks to add measures whose reaggregation is not `sum`.
 * - `right-axis-only`: every measure is on the right axis; the left axis would be an empty scale.
 * - `bad-value`: a measure that is not a finite number (or negative in a percent stack); an x that is not a wall-clock time
 *   (`YYYY-MM-DDTHH:mm:ss`) on a time axis or blank text on a category axis; a blank or non-text, non-number split value.
 * - `duplicate-point`: two rows draw the same point (same x without a split, same x and split value with one), or a number and a text
 *   value draw the same label (`1` and `'1'`); `field` is the x or split field that collides.
 */
export type ChartConfigProblem = { code: 'unknown-field' | 'missing-unit' | 'mixed-units' | 'not-additive' | 'right-axis-only' | 'bad-value' | 'duplicate-point'; field: string };

export type ResolveChartConfigResult = { status: 'ok'; frame: ResolvedChartFrame } | { status: 'problem'; problem: ChartConfigProblem };

/** The Frame appends the series unit to a formatted value, so a percent format multiplies and leaves the `%` to the unit. */
function formatter(format: ChartValueFormat | undefined, lang: 'ko' | 'en'): ((v: number) => string) | undefined {
  if (!format) return undefined;
  const options = format.decimals === undefined ? {} : { decimals: format.decimals };
  return format.kind === 'percent' ? v => formatNumber(v * 100, lang, options) : v => formatNumber(v, lang, options);
}

type Key = { label: string; raw: 'string' | 'number' };
class Collision { constructor(readonly field: string) {} }

/**
 * Pure: a stored ChartConfig v1 (already valid, `invalidChartConfig`), the query rows and the field meta → Chart Frame props (ADR-0176).
 * Colours are each measure's series token, or the series tokens in order; a split measure's series take the tokens in order from its own token.
 * Series follow measure order, or first-seen split values; rows must already be aggregated to one row per point.
 */
export function resolveChartConfig(config: ChartConfig, rows: readonly ChartConfigRow[], fieldMeta: Readonly<Record<string, ChartFieldMeta>>, lang: 'ko' | 'en' = 'ko'): ResolveChartConfigResult {
  const problem = (code: ChartConfigProblem['code'], field: string): ResolveChartConfigResult => ({ status: 'problem', problem: { code, field } });
  const meta = (field: string) => (Object.hasOwn(fieldMeta, field) ? fieldMeta[field] : undefined);
  const read = (row: ChartConfigRow, field: string) => (Object.hasOwn(row, field) ? row[field] : undefined);
  for (const field of [config.x.field, ...config.measures.map(m => m.field), ...(config.split ? [config.split.field] : [])]) {
    if (!meta(field)) return problem('unknown-field', field);
  }

  const percent = config.valueFormat?.kind === 'percent';
  const metaUnit = (field: string) => meta(field)?.unit?.trim() ?? '';
  const unitOf = (field: string) => (percent ? '%' : metaUnit(field));
  const missing = config.measures.find(m => unitOf(m.field) === '');
  if (missing) return problem('missing-unit', missing.field);
  const left = config.measures.filter(m => m.axis !== 'right');
  const right = config.measures.filter(m => m.axis === 'right');
  if (left.length === 0) return problem('right-axis-only', config.measures[0]!.field);
  for (const side of [left, right]) {
    const differs = side.find(m => metaUnit(m.field) !== metaUnit(side[0]!.field));
    if (differs) return problem('mixed-units', differs.field);
  }
  const reaggregations = new Set(config.measures.map(m => meta(m.field)?.reaggregation));
  const reaggregation = reaggregations.size === 1 ? [...reaggregations][0] : undefined;
  const stackMode = config.stack ?? 'none';
  if (stackMode !== 'none') {
    const notAdditive = config.measures.find(m => { const r = meta(m.field)?.reaggregation; return r === undefined || !canClientSum({ reaggregation: r }); });
    if (notAdditive) return problem('not-additive', notAdditive.field);
  }

  // A label is the text the Frame keys a point or series by; a number and a text value that print alike would merge silently.
  const seen = new Map<string, Map<string, Key['raw']>>();
  const key = (row: ChartConfigRow, field: string, time: boolean): Key | null | Collision => {
    const value = read(row, field);
    const k: Key | null = typeof value === 'number' && Number.isFinite(value) && !time ? { label: String(value), raw: 'number' }
      : typeof value === 'string' && value.trim() !== '' && (!time || wallClockEpochMs(value) !== null) ? { label: value, raw: 'string' } : null;
    if (!k) return null;
    const labels = seen.get(field) ?? new Map<string, Key['raw']>();
    seen.set(field, labels);
    const before = labels.get(k.label);
    if (before !== undefined && before !== k.raw) return new Collision(field);
    labels.set(k.label, k.raw);
    return k;
  };
  const time = config.x.type === 'time';
  const value = (row: ChartConfigRow, field: string): number | null | undefined => {
    const v = read(row, field);
    if (v === null || v === undefined) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || (stackMode === 'percent' && v < 0)) return undefined;
    return v;
  };

  const series: ChartSeries[] = [];
  const token = (i: number) => CHART_CONFIG_COLORS[i % CHART_CONFIG_COLORS.length]!;
  const axisOf = (m: ChartConfig['measures'][number]) => (m.axis ? { axis: m.axis } : {});
  const xs = new Set<string>();
  if (config.split) {
    // Every split series covers every x in first-seen order: an x a value has no row for is unknown (null), so stacks line up.
    const measure = config.measures[0]!;
    const bySplit = new Map<string, Map<string, number | null>>();
    for (const row of rows) {
      const x = key(row, config.x.field, time);
      if (x instanceof Collision) return problem('duplicate-point', x.field);
      if (!x) return problem('bad-value', config.x.field);
      const split = key(row, config.split.field, false);
      if (split instanceof Collision) return problem('duplicate-point', split.field);
      if (!split) return problem('bad-value', config.split.field);
      const v = value(row, measure.field);
      if (v === undefined) return problem('bad-value', measure.field);
      xs.add(x.label);
      const values = bySplit.get(split.label) ?? new Map<string, number | null>();
      if (values.has(x.label)) return problem('duplicate-point', config.split.field);
      bySplit.set(split.label, values.set(x.label, v));
    }
    const start = measure.color ? CHART_CONFIG_COLORS.indexOf(measure.color) : 0;
    for (const [label, values] of bySplit) {
      const points = [...xs].map((x): [string, number | null] => [x, values.get(x) ?? null]);
      series.push({ id: label, name: label, color: token(start + series.length), points, unit: unitOf(measure.field), kind: config.kind, ...axisOf(measure) });
    }
  } else {
    const points = config.measures.map((): [string, number | null][] => []);
    for (const row of rows) {
      const x = key(row, config.x.field, time);
      if (x instanceof Collision) return problem('duplicate-point', x.field);
      if (!x) return problem('bad-value', config.x.field);
      if (xs.has(x.label)) return problem('duplicate-point', config.x.field);
      xs.add(x.label);
      for (const [i, measure] of config.measures.entries()) {
        const v = value(row, measure.field);
        if (v === undefined) return problem('bad-value', measure.field);
        points[i]!.push([x.label, v]);
      }
    }
    for (const [i, measure] of config.measures.entries()) {
      series.push({ id: measure.field, name: meta(measure.field)!.label, color: measure.color ?? token(i), points: points[i]!, unit: unitOf(measure.field), kind: config.kind, ...axisOf(measure) });
    }
  }

  const valueFormat = formatter(config.valueFormat, lang);
  const versions = new Set(config.measures.map(m => meta(m.field)?.metricVersion));
  const metricVersion = versions.size === 1 ? [...versions][0] : undefined;
  return {
    status: 'ok',
    frame: {
      series,
      unit: unitOf(left[0]!.field),
      xType: config.x.type,
      orientation: config.orientation ?? 'vertical',
      stackMode,
      ...(config.areaFill === undefined ? {} : { areaFill: config.areaFill }),
      ...(reaggregation ? { reaggregation } : {}),
      ...(valueFormat ? { valueFormat } : {}),
      ...(right.length ? { rightAxis: { unit: unitOf(right[0]!.field), ...(valueFormat ? { valueFormat } : {}) } } : {}),
      ...(metricVersion ? { metricVersion } : {}),
    },
  };
}
