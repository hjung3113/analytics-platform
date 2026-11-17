import { CONTEXT_FIELDS, type ContextKey, type GlobalContext, type Text } from '@ap/contracts';
import { hwTime, hwTimeOverview } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_STEPPED_MESSAGES as S } from '../../messages';

/** S0 mirrors query.required's context/page split, with optional required instead
 * of mandatory page labels. Scope is global but outside capability ContextKey.
 */
export type PanelInputs<K extends string = string> = {
  readonly context?: readonly (ContextKey | 'scopeId')[];
  readonly page?: readonly { readonly key: K; readonly required?: boolean }[];
};
/** #911: 조회 입력 / 표시 입력 / 출력 / 데이터 단위 / 쓸 수 있는 조건.
 * Page outputs never write global Context; permissions stay Kernel-owned.
 */
export type PanelDeclaration<K extends string = string> = {
  readonly id: string;
  readonly title: Text;
  readonly queryInputs: PanelInputs<K>;
  readonly displayInputs: PanelInputs<K>;
  readonly outputs: readonly { readonly key: K; readonly action: string }[];
  readonly grain: string;
  readonly endpoints: readonly string[];
  /** Optional legacy gate override: AND groups of OR keys.
   * Derived availability keys never become query/page inputs.
   */
  readonly availability?: {
    readonly requires: readonly { readonly anyOf: readonly string[] }[];
    readonly disabledReason: Text;
  };
  /** Rendered form, separate from the SDK container used to draw it. */
  readonly kind?: string;
  /** SDK pieces used by this panel, listed by kind for its recipe. */
  readonly pieces?: readonly string[];
};

type InputKey<I extends PanelInputs> = keyof GlobalContext | NonNullable<I['page']>[number]['key'];
/** Context keys name capabilities; identity reads the real GlobalContext fields behind them
 * (`time` → from/to, the same table as `projectContext`). membershipBasis counts only while
 * a condition applies, as in `projectContext`.
 */
function contextFields(key: ContextKey | 'scopeId', context: Readonly<Record<string, unknown>>): readonly string[] {
  if (key === 'scopeId') return ['scopeId'];
  const fields = CONTEXT_FIELDS[key];
  return key === 'condition' && context.condition != null ? [...fields, 'membershipBasis'] : fields;
}
function project<I extends PanelInputs, C extends Record<string, unknown>>(inputs: I, context: C): Pick<C, Extract<InputKey<I>, keyof C>> {
  const keys = [...(inputs.context ?? []).flatMap(key => contextFields(key, context)), ...(inputs.page ?? []).map(input => input.key)];
  return Object.fromEntries(keys.filter(key => context[key] !== undefined).map(key => [key, context[key]])) as Pick<C, Extract<InputKey<I>, keyof C>>;
}
/** 조회 입력: only declared inputs participate in the panel input identity. */
export function projectQueryInputs<I extends PanelInputs, C extends Record<string, unknown>>(declaration: { readonly queryInputs: I }, context: C) {
  return project(declaration.queryInputs, context);
}
/** 표시 입력: emphasis and local presentation never enter query identity. */
export function projectDisplayInputs<I extends PanelInputs, C extends Record<string, unknown>>(declaration: { readonly displayInputs: I }, context: C) {
  return project(declaration.displayInputs, context);
}
function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' && value !== false;
}
/** 쓸 수 있는 조건: derive missing required page labels unless overridden.
 * Global Scope/Context readiness remains Kernel-owned.
 */
export function disabledReason(declaration: Pick<PanelDeclaration, 'queryInputs' | 'availability'>, context: Readonly<Record<string, unknown>>, labels: Readonly<Record<string, Text>> = {}): Text | undefined {
  if (declaration.availability) {
    const missing = declaration.availability.requires.some(requirement => !requirement.anyOf.some(key => present(context[key])));
    return missing ? declaration.availability.disabledReason : undefined;
  }
  const missing = declaration.queryInputs.page?.filter(input => input.required && !present(context[input.key])) ?? [];
  if (!missing.length) return undefined;
  const names = missing.map(input => labels[input.key] ?? { ko: input.key, en: input.key });
  return { ko: names.map(label => label.ko).join(', '), en: names.map(label => label.en).join(', ') };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
/** Pure input identity; the Kernel still owns endpoint/session/permission identity. */
export function panelQueryIdentity<C extends Record<string, unknown>>(declaration: { readonly queryInputs: PanelInputs }, context: C): string {
  return JSON.stringify(canonical(projectQueryInputs(declaration, context)));
}

/** Existing URL state is read once, without a synchronized Context copy. */
export function workspacePanelContext({ step, typeId, motionId, moduleId, trend }: {
  step: number; typeId: string | null; motionId?: string | null; moduleId: string | null; trend: string | null;
}) {
  return { moduleType: typeId, drillMotion: motionId ?? null, drillModule: moduleId, trend, step4: step === 4 };
}
/** C1: resolve after projecting real page inputs. Explicit trend wins for trend;
 * drill wins for scatter. Derived targets are not registered page keys.
 */
export function panelRunTarget(panel: 'trend' | 'scatter', input: { drillModule?: string | null; drillMotion?: string | null; trend?: string | null }): string | null {
  const drillTarget = input.drillModule && input.drillMotion ? `${input.drillModule}/${input.drillMotion}` : null;
  return panel === 'trend' ? input.trend ?? drillTarget : drillTarget ?? input.trend ?? null;
}

const common = ['scopeId', 'time', 'roomNames', 'condition', 'selection'] as const;
const checks = [{ key: 'module' }, { key: 'motion' }] as const;
const verdictDisplay = [...checks, { key: 'verdict' }] as const;
const runInputs = { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule' }, { key: 'drillMotion' }, { key: 'trend' }] } as const;
/** Run panels that read the same linked population as the scatter: drill plus verdict/date. */
const linkedRunInputs = { ...runInputs, page: [...runInputs.page, { key: 'verdict' }, { key: 'date' }] } as const;
const pointAvailability = { requires: [{ anyOf: ['drillModule', 'trend'] }], disabledReason: S.needsPoint } as const;

/** Plain data for #2432 and the future Registry. Checked Module/Motion lists
 * reshape already-fetched data. Table is the existing root aggregate.
 */
export const panelDeclarations = {
  heatmap: { id: 'heatmap', kind: 'heatmap', title: S.heatmap,
    queryInputs: { context: common, page: [{ key: 'moduleType', required: true }] }, displayInputs: { page: [...verdictDisplay, { key: 'drillMotion' }] },
    outputs: [{ key: 'row', action: 'highlight' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix.id],
    availability: { requires: [{ anyOf: ['moduleType'] }], disabledReason: S.needsType }, pieces: ['AnalysisChart', 'QueryView'] },
  trend: { id: 'trend', kind: 'line', title: S.trend, queryInputs: runInputs, displayInputs: { page: [...checks, { key: 'date' }] }, outputs: [],
    grain: 'dailyStat', endpoints: [hwTimeOverview.runs.id], availability: pointAvailability, pieces: ['AnalysisChartFrame', 'AnalysisChart', 'FilterLine', 'QueryView'] },
  scatter: { id: 'scatter', kind: 'scatter', title: S.scatter, queryInputs: linkedRunInputs, displayInputs: { page: checks }, outputs: [],
    grain: 'run', endpoints: [hwTimeOverview.runs.id], availability: pointAvailability, pieces: ['AnalysisChart', 'FilterLine', 'QueryView'] },
  distribution: { id: 'distribution', kind: 'histogram', title: S.distribution, queryInputs: linkedRunInputs, displayInputs: { page: checks }, outputs: [],
    grain: 'run', endpoints: [hwTimeOverview.distribution.id], availability: pointAvailability, pieces: ['AnalysisChart', 'QueryView'] },
  motionTable: { id: 'motionTable', kind: 'table', title: S.motionTable,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule', required: true }] }, displayInputs: { page: [{ key: 'motion' }] },
    outputs: [{ key: 'drillMotion', action: 'drill' }, { key: 'trend', action: 'drill' }, { key: 'focus', action: 'highlight' }],
    grain: 'motionStat', endpoints: [hwTimeOverview.motionStats.id],
    availability: { requires: [{ anyOf: ['drillModule'] }], disabledReason: S.needsModule }, pieces: ['PlatformDataTable', 'RowAction', 'QueryView'] },
  moduleMotions: { id: 'moduleMotions', kind: 'bar-horizontal', title: S.moduleMotions,
    queryInputs: { context: common, page: [{ key: 'moduleType' }] },
    displayInputs: { page: [...verdictDisplay, { key: 'drillModule' }, { key: 'row' }, { key: 'barsSort' }, { key: 'barsGroup' }, { key: 'barsMinMax' }, { key: 'align' }] },
    outputs: [{ key: 'trend', action: 'drill' }, { key: 'row', action: 'highlight' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix.id],
    availability: { requires: [{ anyOf: ['step4'] }], disabledReason: S.needsStep4 }, pieces: ['AnalysisChartFrame', 'PanelOptions', 'PanelOptionChips', 'QueryView'] },
  table: { id: 'table', kind: 'table', title: S.table,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'page' }, { key: 'sort' }, { key: 'focus' }] }, displayInputs: { page: checks },
    outputs: [{ key: 'moduleType', action: 'drill' }, { key: 'drillMotion', action: 'drill' }, { key: 'drillModule', action: 'drill' },
      { key: 'row', action: 'highlight' }, { key: 'trend', action: 'drill' }, { key: 'focus', action: 'highlight' }, { key: 'page', action: 'page' }, { key: 'sort', action: 'sort' }],
    grain: 'rootAggregate', endpoints: [hwTime.levelRows.id, hwTime.tableRows.id, hwTime.exportRows.id, hwTime.trend.id], pieces: ['PlatformDataTable', 'RowAction', 'DetailDrawer', 'QueryView', 'StateMessage'] },
  donut: { id: 'donut', kind: 'donut', title: N.donut, queryInputs: { context: common, page: [{ key: 'moduleType' }] }, displayInputs: { page: [...checks, { key: 'verdict' }] },
    outputs: [{ key: 'verdict', action: 'verdict' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix.id], pieces: ['AnalysisChart:donut', 'QueryView'] },
  pareto: { id: 'pareto', kind: 'pareto', title: N.pareto, queryInputs: { context: common, page: [{ key: 'moduleType' }] }, displayInputs: { page: checks },
    outputs: [], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix.id], pieces: ['AnalysisChart:pareto', 'QueryView'] },
  equipmentDays: { id: 'equipmentDays', kind: 'heatmap', title: N.equipmentDays,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule' }, { key: 'drillMotion' }] }, displayInputs: { page: [{ key: 'verdict' }] },
    outputs: [{ key: 'date', action: 'date' }], grain: 'equipmentDay', endpoints: [hwTimeOverview.equipmentDays.id], pieces: ['AnalysisChart:heatmap', 'QueryView'] },
  boundHistory: { id: 'boundHistory', kind: 'audit', title: N.boundHistory,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule' }, { key: 'drillMotion' }] }, displayInputs: {},
    outputs: [], grain: 'auditEvent', endpoints: [hwTimeOverview.boundHistory.id], pieces: ['AuditTimeline', 'QueryView'] },
} as const satisfies Readonly<Record<string, PanelDeclaration>>;
