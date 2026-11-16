import { CONTEXT_FIELDS, type ContextKey, type GlobalContext, type Text } from '@ap/contracts';
import { hwTime, hwTimeOverview } from '../../endpoints';
import { HW_TIME_STEPPED_MESSAGES as S } from '../../messages';

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
const runInputs = { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule' }, { key: 'drillMotion' }, { key: 'trend' }] } as const;
const pointAvailability = { requires: [{ anyOf: ['drillModule', 'trend'] }], disabledReason: S.needsPoint } as const;

/** Plain data for #2432 and the future Registry. Checked Module/Motion lists
 * reshape already-fetched data. Table is the existing root aggregate.
 */
export const panelDeclarations = {
  heatmap: { id: 'heatmap', title: S.heatmap,
    queryInputs: { context: common, page: [{ key: 'moduleType', required: true }] }, displayInputs: { page: checks },
    outputs: [{ key: 'row', action: 'highlight' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix.id],
    availability: { requires: [{ anyOf: ['moduleType'] }], disabledReason: S.needsType } },
  trend: { id: 'trend', title: S.trend, queryInputs: runInputs, displayInputs: { page: checks }, outputs: [],
    grain: 'dailyStat', endpoints: [hwTimeOverview.runs.id], availability: pointAvailability },
  scatter: { id: 'scatter', title: S.scatter, queryInputs: runInputs, displayInputs: { page: checks }, outputs: [],
    grain: 'run', endpoints: [hwTimeOverview.runs.id], availability: pointAvailability },
  motionTable: { id: 'motionTable', title: S.motionTable,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'drillModule', required: true }] }, displayInputs: { page: [{ key: 'motion' }] },
    outputs: [{ key: 'drillMotion', action: 'drill' }, { key: 'trend', action: 'drill' }, { key: 'focus', action: 'highlight' }],
    grain: 'motionStat', endpoints: [hwTimeOverview.motionStats.id],
    availability: { requires: [{ anyOf: ['drillModule'] }], disabledReason: S.needsModule } },
  moduleMotions: { id: 'moduleMotions', title: S.moduleMotions,
    queryInputs: { context: common, page: [{ key: 'moduleType' }] },
    displayInputs: { page: [...checks, { key: 'drillModule' }, { key: 'row' }, { key: 'barsSort' }, { key: 'barsGroup' }, { key: 'barsMinMax' }, { key: 'align' }] },
    outputs: [{ key: 'trend', action: 'drill' }, { key: 'row', action: 'highlight' }], grain: 'matrixStat', endpoints: [hwTimeOverview.matrix.id],
    availability: { requires: [{ anyOf: ['step4'] }], disabledReason: S.needsStep4 } },
  table: { id: 'table', title: S.table,
    queryInputs: { context: common, page: [{ key: 'moduleType' }, { key: 'page' }, { key: 'sort' }, { key: 'focus' }] }, displayInputs: { page: checks },
    outputs: [{ key: 'moduleType', action: 'drill' }, { key: 'drillMotion', action: 'drill' }, { key: 'drillModule', action: 'drill' },
      { key: 'row', action: 'highlight' }, { key: 'trend', action: 'drill' }, { key: 'focus', action: 'highlight' }, { key: 'page', action: 'page' }, { key: 'sort', action: 'sort' }],
    grain: 'rootAggregate', endpoints: [hwTime.levelRows.id, hwTime.tableRows.id, hwTime.exportRows.id, hwTime.trend.id] },
} as const satisfies Readonly<Record<string, PanelDeclaration>>;
