import { CHART_CONFIG_COLORS, canClientSum, formatNumber, type ChartConfig, type ChartValueFormat, type Reaggregation } from '@ap/contracts';
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
 * - `mixed-units`: measures on one axis have different units.
 * - `not-additive`: `stack` asks to add measures whose reaggregation is not `sum`.
 * - `bad-value`: a row holds a non-finite or non-numeric measure, or an x / split value that is not text or a number.
 * - `duplicate-point`: two rows share an x and a split value (the rows are not aggregated to the config's grain); `field` is the split field.
 */
export type ChartConfigProblem = { code: 'unknown-field' | 'mixed-units' | 'not-additive' | 'bad-value' | 'duplicate-point'; field: string };

export type ResolveChartConfigResult = { status: 'ok'; frame: ResolvedChartFrame } | { status: 'problem'; problem: ChartConfigProblem };

function formatter(format: ChartValueFormat | undefined, lang: 'ko' | 'en'): ((v: number) => string) | undefined {
  if (!format) return undefined;
  const options = format.decimals === undefined ? {} : { decimals: format.decimals };
  return format.kind === 'percent' ? v => `${formatNumber(v * 100, lang, options)}%` : v => formatNumber(v, lang, options);
}

const label = (value: string | number | null | undefined) => (typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null);

/**
 * Pure: a stored ChartConfig v1 (already valid, `invalidChartConfig`), the query rows and the field meta → Chart Frame props (ADR-0176).
 * Colours are the config's series tokens, or the series tokens in order; series follow measure order, or first-seen split values.
 */
export function resolveChartConfig(config: ChartConfig, rows: readonly ChartConfigRow[], fieldMeta: Readonly<Record<string, ChartFieldMeta>>, lang: 'ko' | 'en' = 'ko'): ResolveChartConfigResult {
  const problem = (code: ChartConfigProblem['code'], field: string): ResolveChartConfigResult => ({ status: 'problem', problem: { code, field } });
  const meta = (field: string) => (Object.hasOwn(fieldMeta, field) ? fieldMeta[field] : undefined);
  for (const field of [config.x.field, ...config.measures.map(m => m.field), ...(config.split ? [config.split.field] : [])]) {
    if (!meta(field)) return problem('unknown-field', field);
  }

  const left = config.measures.filter(m => m.axis !== 'right');
  const right = config.measures.filter(m => m.axis === 'right');
  for (const side of [left, right]) {
    const units = new Set(side.map(m => meta(m.field)?.unit ?? ''));
    if (units.size > 1) return problem('mixed-units', side[1]!.field);
  }
  const reaggregations = new Set(config.measures.map(m => meta(m.field)?.reaggregation));
  const reaggregation = reaggregations.size === 1 ? [...reaggregations][0] : undefined;
  const stackMode = config.stack ?? 'none';
  if (stackMode !== 'none') {
    const notAdditive = config.measures.find(m => { const r = meta(m.field)?.reaggregation; return r === undefined || !canClientSum({ reaggregation: r }); });
    if (notAdditive) return problem('not-additive', notAdditive.field);
  }

  const series: ChartSeries[] = [];
  const unitOf = (field: string) => meta(field)?.unit ?? '';
  const color = (i: number, own?: ChartConfig['measures'][number]['color']) => own ?? CHART_CONFIG_COLORS[i % CHART_CONFIG_COLORS.length]!;
  const point = (row: ChartConfigRow, field: string): [string, number | null] | ChartConfigProblem => {
    const x = label(row[config.x.field]);
    if (x === null) return { code: 'bad-value', field: config.x.field };
    const value = row[field];
    if (value === null || value === undefined) return [x, null];
    return typeof value === 'number' && Number.isFinite(value) ? [x, value] : { code: 'bad-value', field };
  };

  if (config.split) {
    // Every split series covers every x in first-seen order: an x a value has no row for is unknown (null), so stacks line up.
    const measure = config.measures[0]!;
    const xs = new Set<string>();
    const bySplit = new Map<string, Map<string, number | null>>();
    for (const row of rows) {
      const key = label(row[config.split.field]);
      if (key === null) return problem('bad-value', config.split.field);
      const p = point(row, measure.field);
      if (!Array.isArray(p)) return { status: 'problem', problem: p };
      xs.add(p[0]);
      const values = bySplit.get(key) ?? new Map<string, number | null>();
      if (values.has(p[0])) return problem('duplicate-point', config.split.field);
      bySplit.set(key, values.set(p[0], p[1]));
    }
    for (const [key, values] of bySplit) {
      const points = [...xs].map((x): [string, number | null] => [x, values.get(x) ?? null]);
      series.push({ id: key, name: key, color: color(series.length), points, unit: unitOf(measure.field), kind: config.kind, ...(measure.axis ? { axis: measure.axis } : {}) });
    }
  } else {
    for (const [i, measure] of config.measures.entries()) {
      const points: [string, number | null][] = [];
      for (const row of rows) {
        const p = point(row, measure.field);
        if (!Array.isArray(p)) return { status: 'problem', problem: p };
        points.push(p);
      }
      series.push({ id: measure.field, name: meta(measure.field)!.label, color: color(i, measure.color), points, unit: unitOf(measure.field), kind: config.kind, ...(measure.axis ? { axis: measure.axis } : {}) });
    }
  }

  const valueFormat = formatter(config.valueFormat, lang);
  const versions = new Set(config.measures.map(m => meta(m.field)?.metricVersion));
  const metricVersion = versions.size === 1 ? [...versions][0] : undefined;
  return {
    status: 'ok',
    frame: {
      series,
      unit: left.length ? unitOf(left[0]!.field) : unitOf(config.measures[0]!.field),
      xType: config.x.type,
      orientation: config.orientation ?? 'vertical',
      stackMode,
      ...(config.areaFill ? { areaFill: true } : {}),
      ...(reaggregation ? { reaggregation } : {}),
      ...(valueFormat ? { valueFormat } : {}),
      ...(right.length ? { rightAxis: { unit: unitOf(right[0]!.field), ...(valueFormat ? { valueFormat } : {}) } } : {}),
      ...(metricVersion ? { metricVersion } : {}),
    },
  };
}
