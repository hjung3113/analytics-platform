import type { Text } from '../i18n.js';
import type { ChartConfig } from '../links/chart-config.js';
import { invalidMenuViewPanels, type PanelInstance } from '../links/menu-view-panels.js';
import { canClientSum, type Reaggregation } from '../values/measure.js';
import type { Permission } from './menu.js';

/**
 * A measure a menu offers for charts made from settings (#2761, ADR-0176). `id` is also the field of the rows the menu's chart query
 * returns. Planned to match an analysis dataset's measure (#1704) so a later step swaps only the source; that contract is not in code yet.
 */
export type ChartMeasureDeclaration = {
  readonly id: string;
  readonly label: Text;
  readonly unit: string;
  readonly reaggregation: Reaggregation;
  readonly metricVersion?: string;
  /** Without it every actor may chart the measure; with it only an actor `granted` confirms may (the chip shows the reason). */
  readonly permission?: Permission;
  /** Breakdown ids this measure can be split by; without it, every declared breakdown. */
  readonly breakdowns?: readonly string[];
};
/** A 기준 (breakdown): the category dimension a chart splits by. `id` is the row field; `dimension` names the analysis selection it outputs. */
export type ChartBreakdownDeclaration = { readonly id: string; readonly label: Text; readonly dimension: string };
/**
 * `MenuMeta.chartFields`: what charts made from settings may pick in this menu. `time` is the wall-clock row field a line chart draws on;
 * without it the menu offers bar charts only. A menu that declares nothing keeps its panel menu as it is.
 */
export type MenuChartFields = {
  readonly measures: readonly ChartMeasureDeclaration[];
  readonly breakdowns: readonly ChartBreakdownDeclaration[];
  readonly time?: { readonly field: string; readonly label: Text };
};

/** Chart kinds made from settings. Kinds the SDK cannot make yet are not offered at all (owner 2026-11-25). */
export const CHART_PANEL_KINDS = ['line', 'bar'] as const;
export type ChartPanelKind = (typeof CHART_PANEL_KINDS)[number];
/**
 * A picker or settings drawer state: one measure per chart in step 1 (owner 2026-11-25). `stack` stacks a line chart's breakdown series.
 * A percent stack is not offered: it needs measures that declare they are never negative, which the declaration cannot say yet.
 */
export type ChartPanelDraft = { kind: ChartPanelKind; measure?: string; breakdown?: string; stack?: 'none' | 'stack' };
/** Whether the actor holds a permission. Required, so a caller that cannot tell never lets a protected measure through. */
export type ChartPermissionCheck = (permission: Permission) => boolean;

/**
 * Why a choice cannot make a chart. The picker dims a chip with this reason and the settings drawer (#2762) shows the same one.
 * - `unknown-measure` / `unknown-breakdown`: the id is not declared (also a saved chart whose field the menu removed).
 * - `measure-denied`: the actor lacks the measure's permission.
 * - `breakdown-not-offered`: the measure lists its breakdowns and this is not one.
 * - `needs-time`: a line chart in a menu that declares no time field.
 * - `not-additive`: stacking a measure whose reaggregation is not `sum`; the client must not add its parts.
 * - `stack-needs-series`: stacking a bar chart, which draws one bar per breakdown value and has nothing to stack.
 * - `incomplete`: no measure or no breakdown yet. A chip judged alone returns it and stays choosable; only «더하기» needs null.
 * - `changed`: a saved chart no longer matches what this menu makes from its measure and breakdown (another time field, mapping, option
 *   or output dimension). It is never drawn as something else, so the saved selection keeps its meaning.
 */
export type ChartPanelProblemCode = 'unknown-measure' | 'unknown-breakdown' | 'measure-denied' | 'breakdown-not-offered' | 'needs-time' | 'not-additive' | 'stack-needs-series' | 'incomplete' | 'changed';
export type ChartPanelProblem = { code: ChartPanelProblemCode; reason: Text };

/** Reasons name neither the measure nor the breakdown: the dimmed chip or the panel title already does. */
const REASONS: Record<ChartPanelProblemCode, Text> = {
  'unknown-measure': { ko: '이 메뉴에 없는 지표입니다', en: 'This menu has no such measure' },
  'unknown-breakdown': { ko: '이 메뉴에 없는 기준입니다', en: 'This menu has no such breakdown' },
  'measure-denied': { ko: '이 지표를 볼 권한이 없습니다', en: 'You do not have access to this measure' },
  'breakdown-not-offered': { ko: '이 지표는 이 기준으로 볼 수 없습니다', en: 'This measure cannot be broken down this way' },
  'needs-time': { ko: '선 차트는 시간 축이 있는 메뉴에서만 만들 수 있습니다', en: 'Line charts need a menu with a time axis' },
  'not-additive': { ko: '더할 수 없는 지표라 쌓을 수 없습니다', en: 'This measure cannot be added up, so it cannot be stacked' },
  'stack-needs-series': { ko: '막대 차트는 기준 값마다 막대 하나라 쌓을 수 없습니다', en: 'A bar chart draws one bar per value, so it cannot be stacked' },
  incomplete: { ko: '지표와 기준을 고르세요', en: 'Choose a measure and a breakdown' },
  changed: { ko: '메뉴가 바뀌어 저장된 차트를 그대로 열 수 없습니다', en: 'The menu has changed, so this saved chart cannot be opened as it was' },
};
const reason = (code: ChartPanelProblemCode): ChartPanelProblem => ({ code, reason: REASONS[code] });

const byId = <T extends { id: string }>(items: readonly T[], id: string | undefined) => (id === undefined ? undefined : items.find(item => item.id === id));

type Judged = { problem: ChartPanelProblem } | { measure: ChartMeasureDeclaration; breakdown: ChartBreakdownDeclaration };
function judge(fields: MenuChartFields, draft: ChartPanelDraft, granted: ChartPermissionCheck): Judged {
  const fail = (code: ChartPanelProblemCode) => ({ problem: reason(code) });
  const stacked = draft.stack === 'stack';
  const measure = byId(fields.measures, draft.measure);
  if (draft.measure !== undefined && !measure) return fail('unknown-measure');
  if (measure?.permission && !granted(measure.permission)) return fail('measure-denied');
  if (stacked && draft.kind === 'bar') return fail('stack-needs-series');
  if (measure && stacked && !canClientSum(measure)) return fail('not-additive');
  const breakdown = byId(fields.breakdowns, draft.breakdown);
  if (draft.breakdown !== undefined && !breakdown) return fail('unknown-breakdown');
  if (measure && breakdown && measure.breakdowns && !measure.breakdowns.includes(breakdown.id)) return fail('breakdown-not-offered');
  if (draft.kind === 'line' && !fields.time) return fail('needs-time');
  if (!measure || !breakdown) return fail('incomplete');
  return { measure, breakdown };
}

/**
 * The first reason `draft` cannot make a chart in this menu, or null. Pure: a chip is judged by passing the draft with that chip chosen.
 * Checks run measure first, then breakdown, then kind, so a dimmed measure chip never blames a breakdown the user has not picked.
 */
export function chartPanelProblem(fields: MenuChartFields, draft: ChartPanelDraft, granted: ChartPermissionCheck): ChartPanelProblem | null {
  const judged = judge(fields, draft, granted);
  return 'problem' in judged ? judged.problem : null;
}

export type MappingSlot = 'measure' | 'breakdown';
export type MappingChip = { kind: MappingSlot; id: string };

const SLOT_KIND_REASONS: Record<MappingSlot, Text> = {
  measure: { ko: '지표 칸에는 지표만 놓을 수 있습니다', en: 'Only measures can go in the measure slot' },
  breakdown: { ko: '기준 칸에는 기준만 놓을 수 있습니다', en: 'Only breakdowns can go in the breakdown slot' },
};

/** Replaces one slot without moving the previous chip into the other slot. */
export function assignMappingSlot(draft: ChartPanelDraft, slot: MappingSlot, chip: MappingChip): ChartPanelDraft {
  return slot === chip.kind ? { ...draft, [slot]: chip.id } : draft;
}

/** Why a chip cannot be placed here. The other slot may still be empty. */
export function mappingSlotProblem(fields: MenuChartFields, draft: ChartPanelDraft, slot: MappingSlot, chip: MappingChip, granted: ChartPermissionCheck): Text | undefined {
  if (slot !== chip.kind) return SLOT_KIND_REASONS[slot];
  const problem = chartPanelProblem(fields, assignMappingSlot(draft, slot, chip), granted);
  return problem?.code === 'incomplete' ? undefined : problem?.reason;
}

/** Default chart title «지표 · 기준» (owner 2026-11-25). */
export function chartPanelTitle(measure: ChartMeasureDeclaration, breakdown: ChartBreakdownDeclaration): Text {
  return { ko: `${measure.label.ko} · ${breakdown.label.ko}`, en: `${measure.label.en} · ${breakdown.label.en}` };
}

/** The selection output key of a chart panel made from settings: `<instance id>.selection` in the URL. */
export const CHART_PANEL_OUTPUT_KEY = 'selection';

/** The one source and outputs this menu makes from a judged draft: creation builds it, reopening compares the saved panel with it. */
function build(fields: MenuChartFields, draft: ChartPanelDraft, judged: Exclude<Judged, { problem: ChartPanelProblem }>): Pick<PanelInstance, 'source' | 'outputs'> {
  const { measure, breakdown } = judged;
  const stack = draft.stack === 'stack' ? { stack: 'stack' as const } : {};
  const config: ChartConfig = draft.kind === 'line' && fields.time
    ? { version: 1, kind: 'line', x: { field: fields.time.field, type: 'time' }, measures: [{ field: measure.id }], split: { field: breakdown.id }, ...stack }
    : { version: 1, kind: 'bar', x: { field: breakdown.id, type: 'category' }, measures: [{ field: measure.id }] };
  const outputs = draft.kind === 'bar' ? [{ key: CHART_PANEL_OUTPUT_KEY, dimension: breakdown.dimension, shape: 'set' as const }] : [];
  return { source: { kind: 'chart', config }, outputs };
}

/**
 * A `chart` panel instance from a complete, valid draft, or the problem that stops it. A line chart draws the measure over the menu's
 * time field, one series per breakdown value; a bar chart draws it per breakdown value on a category axis and outputs the chosen values
 * as a `set` selection of the breakdown's dimension. The menu's chart query returns one row per time and breakdown value (line) or per
 * breakdown value (bar). `id` is the new instance id (`nextChartPanelId`); one the saved-view rules refuse throws.
 */
export function createChartPanel(fields: MenuChartFields, draft: ChartPanelDraft, id: string, granted: ChartPermissionCheck):
  { status: 'ok'; instance: PanelInstance } | { status: 'problem'; problem: ChartPanelProblem } {
  const judged = judge(fields, draft, granted);
  if ('problem' in judged) return { status: 'problem', problem: judged.problem };
  const instance: PanelInstance = { id, ...build(fields, draft, judged), inputs: [] };
  // The saved-view store also refuses NUL and lone surrogates (platform-api `isPgSafeString`); an id is never meant to hold either.
  const invalid = invalidMenuViewPanels({ version: 1, instances: [instance] }) ?? (/[\u0000-\u001f\u007f\uD800-\uDFFF]/.test(id) ? 'id must not contain control characters or surrogates' : null);
  if (invalid) throw new Error(`createChartPanel: ${invalid}`);
  return { status: 'ok', instance };
}

/** `chart-<n>` with the smallest n no existing instance uses. */
export function nextChartPanelId(existing: readonly string[]): string {
  let n = 1;
  while (existing.includes(`chart-${n}`)) n += 1;
  return `chart-${n}`;
}

export type ReadChartPanel =
  | { status: 'ok'; kind: ChartPanelKind; measure: ChartMeasureDeclaration; breakdown: ChartBreakdownDeclaration; title: Text }
  | { status: 'problem'; problem: ChartPanelProblem };

/** JSON text with object keys sorted, so two plain JSON values compare by content whatever their key order. */
const canonical = (value: unknown) => JSON.stringify(value, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/** Compares stored chart configurations by content, independent of JSON object key order. */
export function sameChartConfig(left: ChartConfig | undefined, right: ChartConfig | undefined): boolean {
  return left === right || canonical(left) === canonical(right);
}

/** Extracts editable slots even when the stored fields are no longer declared. */
export function readChartPanelDraft(config: ChartConfig): ChartPanelDraft {
  return {
    kind: config.kind,
    measure: config.measures[0]?.field,
    breakdown: config.kind === 'line' ? config.split?.field : config.x.field,
    ...(config.stack === 'stack' ? { stack: 'stack' } : {}),
  };
}

/**
 * Reads a saved chart panel back against the menu's current declaration when a saved view opens. The panel opens only when its source and
 * outputs are exactly what this menu makes from the same measure, breakdown, kind and stack now; otherwise only that panel shows the
 * reason (a dropped field, a lost permission, or `changed`), and the saved instance with its selection output stays as it was.
 */
export function readChartPanel(fields: MenuChartFields | undefined, instance: Pick<PanelInstance, 'source' | 'outputs'>, granted: ChartPermissionCheck): ReadChartPanel {
  if (instance.source.kind !== 'chart') return { status: 'problem', problem: reason('changed') };
  const { config } = instance.source;
  const declared = fields ?? { measures: [], breakdowns: [] };
  const draft = readChartPanelDraft(config);
  const judged = judge(declared, draft, granted);
  // `incomplete` means «keep choosing» in the picker; on a saved chart a missing measure or breakdown is a mapping this menu never makes.
  if ('problem' in judged) return { status: 'problem', problem: judged.problem.code === 'incomplete' ? reason('changed') : judged.problem };
  if (canonical(build(declared, draft, judged)) !== canonical({ source: instance.source, outputs: instance.outputs })) return { status: 'problem', problem: reason('changed') };
  return { status: 'ok', kind: config.kind, measure: judged.measure, breakdown: judged.breakdown, title: chartPanelTitle(judged.measure, judged.breakdown) };
}

/** Field meta for drawing (`resolveChartConfig`'s `fieldMeta`): each declared field's label in `lang`, and unit and reaggregation for measures. */
export function chartFieldMeta(fields: MenuChartFields, lang: 'ko' | 'en'): Record<string, { label: string; unit?: string; reaggregation?: Reaggregation; metricVersion?: string }> {
  return Object.fromEntries([
    ...(fields.time ? [[fields.time.field, { label: fields.time.label[lang] }]] : []),
    ...fields.breakdowns.map(b => [b.id, { label: b.label[lang] }]),
    ...fields.measures.map(m => [m.id, { label: m.label[lang], unit: m.unit, reaggregation: m.reaggregation, ...(m.metricVersion ? { metricVersion: m.metricVersion } : {}) }]),
  ]);
}
