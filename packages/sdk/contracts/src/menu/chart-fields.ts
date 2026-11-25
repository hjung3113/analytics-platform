import type { Text } from '../i18n.js';
import type { ChartConfig } from '../links/chart-config.js';
import type { PanelInstance } from '../links/menu-view-panels.js';
import { canClientSum, type Reaggregation } from '../values/measure.js';
import type { Permission } from './menu.js';

/**
 * A measure a menu offers for charts made from settings (#2761, ADR-0176). `id` is also the field of the rows the menu's chart query
 * returns. Same shape as an analysis dataset's measure, so a later step only swaps the source.
 */
export type ChartMeasureDeclaration = {
  readonly id: string;
  readonly label: Text;
  readonly unit: string;
  readonly reaggregation: Reaggregation;
  readonly metricVersion?: string;
  /** Without it every actor may chart the measure; with it the chip shows the permission reason. */
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
/** A picker or settings drawer state: one measure per chart in step 1 (owner 2026-11-25). */
export type ChartPanelDraft = { kind: ChartPanelKind; measure?: string; breakdown?: string; stack?: 'none' | 'stack' | 'percent' };

/**
 * Why a choice cannot make a chart. The picker dims a chip with this reason and the settings drawer (#2762) shows the same one.
 * - `unknown-measure` / `unknown-breakdown`: the id is not declared (also a saved chart whose field the menu removed).
 * - `measure-denied`: the actor lacks the measure's permission.
 * - `breakdown-not-offered`: the measure lists its breakdowns and this is not one.
 * - `needs-time`: a line chart in a menu that declares no time field.
 * - `not-additive`: stacking a measure whose reaggregation is not `sum`; the client must not add its parts.
 * - `incomplete`: no measure or no breakdown yet.
 */
export type ChartPanelProblemCode = 'unknown-measure' | 'unknown-breakdown' | 'measure-denied' | 'breakdown-not-offered' | 'needs-time' | 'not-additive' | 'incomplete';
export type ChartPanelProblem = { code: ChartPanelProblemCode; reason: Text };

/** Reasons name neither the measure nor the breakdown: the dimmed chip or the panel title already does. */
const REASONS: Record<ChartPanelProblemCode, Text> = {
  'unknown-measure': { ko: '이 메뉴에 없는 지표입니다', en: 'This menu has no such measure' },
  'unknown-breakdown': { ko: '이 메뉴에 없는 기준입니다', en: 'This menu has no such breakdown' },
  'measure-denied': { ko: '이 지표를 볼 권한이 없습니다', en: 'You do not have access to this measure' },
  'breakdown-not-offered': { ko: '이 지표는 이 기준으로 볼 수 없습니다', en: 'This measure cannot be broken down this way' },
  'needs-time': { ko: '선 차트는 시간 축이 있는 메뉴에서만 만들 수 있습니다', en: 'Line charts need a menu with a time axis' },
  'not-additive': { ko: '더할 수 없는 지표라 쌓을 수 없습니다', en: 'This measure cannot be added up, so it cannot be stacked' },
  incomplete: { ko: '지표와 기준을 고르세요', en: 'Choose a measure and a breakdown' },
};
const reason = (code: ChartPanelProblemCode): ChartPanelProblem => ({ code, reason: REASONS[code] });

const byId = <T extends { id: string }>(items: readonly T[], id: string | undefined) => (id === undefined ? undefined : items.find(item => item.id === id));

/**
 * The first reason `draft` cannot make a chart in this menu, or null. Pure: a chip is judged by passing the draft with that chip chosen.
 * Checks run measure first, then breakdown, then kind, so a dimmed measure chip never blames a breakdown the user has not picked.
 * `granted` answers the actor's permissions; without it a measure permission is not checked.
 */
export function chartPanelProblem(fields: MenuChartFields, draft: ChartPanelDraft, granted?: (permission: Permission) => boolean): ChartPanelProblem | null {
  const judged = judge(fields, draft, granted);
  return 'problem' in judged ? judged.problem : null;
}

type Judged = { problem: ChartPanelProblem } | { measure: ChartMeasureDeclaration; breakdown: ChartBreakdownDeclaration; time: MenuChartFields['time'] };
function judge(fields: MenuChartFields, draft: ChartPanelDraft, granted?: (permission: Permission) => boolean): Judged {
  const fail = (code: ChartPanelProblemCode) => ({ problem: reason(code) });
  const measure = byId(fields.measures, draft.measure);
  if (draft.measure !== undefined && !measure) return fail('unknown-measure');
  if (measure?.permission && granted && !granted(measure.permission)) return fail('measure-denied');
  if (measure && draft.stack !== undefined && draft.stack !== 'none' && !canClientSum(measure)) return fail('not-additive');
  const breakdown = byId(fields.breakdowns, draft.breakdown);
  if (draft.breakdown !== undefined && !breakdown) return fail('unknown-breakdown');
  if (measure && breakdown && measure.breakdowns && !measure.breakdowns.includes(breakdown.id)) return fail('breakdown-not-offered');
  if (draft.kind === 'line' && !fields.time) return fail('needs-time');
  if (!measure || !breakdown) return fail('incomplete');
  return { measure, breakdown, time: fields.time };
}

/** Default chart title «지표 · 기준» (owner 2026-11-25). */
export function chartPanelTitle(measure: ChartMeasureDeclaration, breakdown: ChartBreakdownDeclaration): Text {
  return { ko: `${measure.label.ko} · ${breakdown.label.ko}`, en: `${measure.label.en} · ${breakdown.label.en}` };
}

/** The selection output key of a chart panel made from settings: `<instance id>.selection` in the URL. */
export const CHART_PANEL_OUTPUT_KEY = 'selection';

/**
 * A `chart` panel instance from a complete, valid draft, or the problem that stops it. A line chart draws the measure over the menu's
 * time field, one series per breakdown value; a bar chart draws it per breakdown value on a category axis and outputs the chosen values
 * as a `set` selection of the breakdown's dimension. `id` is the new instance id (`nextChartPanelId`).
 */
export function createChartPanel(fields: MenuChartFields, draft: ChartPanelDraft, id: string, granted?: (permission: Permission) => boolean):
  { status: 'ok'; instance: PanelInstance } | { status: 'problem'; problem: ChartPanelProblem } {
  const judged = judge(fields, draft, granted);
  if ('problem' in judged) return { status: 'problem', problem: judged.problem };
  const { measure, breakdown, time } = judged;
  const stack = draft.stack !== undefined && draft.stack !== 'none' ? { stack: draft.stack } : {};
  const config: ChartConfig = draft.kind === 'line' && time
    ? { version: 1, kind: 'line', x: { field: time.field, type: 'time' }, measures: [{ field: measure.id }], split: { field: breakdown.id }, ...stack }
    : { version: 1, kind: 'bar', x: { field: breakdown.id, type: 'category' }, measures: [{ field: measure.id }], ...stack };
  const outputs = draft.kind === 'bar' ? [{ key: CHART_PANEL_OUTPUT_KEY, dimension: breakdown.dimension, shape: 'set' as const }] : [];
  return { status: 'ok', instance: { id, source: { kind: 'chart', config }, inputs: [], outputs } };
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

/**
 * Reads a stored ChartConfig back against the menu's current declaration when a saved view opens. A chart whose measure or breakdown the
 * menu no longer declares, or that the actor may no longer see, comes back as a problem so only that panel shows the reason.
 */
export function readChartPanel(fields: MenuChartFields | undefined, config: ChartConfig, granted?: (permission: Permission) => boolean): ReadChartPanel {
  const declared = fields ?? { measures: [], breakdowns: [] };
  const breakdownField = config.kind === 'line' ? config.split?.field : config.x.field;
  const draft: ChartPanelDraft = { kind: config.kind, measure: config.measures[0]?.field, breakdown: breakdownField, ...(config.stack ? { stack: config.stack } : {}) };
  const judged = judge(declared, draft, granted);
  if ('problem' in judged) return { status: 'problem', problem: judged.problem };
  const { measure, breakdown } = judged;
  // The stored chart must still draw what the declaration now means: the same time field, and one measure per chart.
  if (config.kind === 'line' && config.x.field !== judged.time?.field) return { status: 'problem', problem: reason('needs-time') };
  if (config.measures.length !== 1) return { status: 'problem', problem: reason('unknown-measure') };
  return { status: 'ok', kind: config.kind, measure, breakdown, title: chartPanelTitle(measure, breakdown) };
}

/** Field meta for drawing (`resolveChartConfig`'s `fieldMeta`): each declared field's label in `lang`, and unit and reaggregation for measures. */
export function chartFieldMeta(fields: MenuChartFields, lang: 'ko' | 'en'): Record<string, { label: string; unit?: string; reaggregation?: Reaggregation; metricVersion?: string }> {
  return Object.fromEntries([
    ...(fields.time ? [[fields.time.field, { label: fields.time.label[lang] }]] : []),
    ...fields.breakdowns.map(b => [b.id, { label: b.label[lang] }]),
    ...fields.measures.map(m => [m.id, { label: m.label[lang], unit: m.unit, reaggregation: m.reaggregation, ...(m.metricVersion ? { metricVersion: m.metricVersion } : {}) }]),
  ]);
}
