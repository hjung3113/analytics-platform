import type { ChangeLine, MenuView, SavedView, SavedViewContext, SavedViewSupport, ViewCapabilities } from '@ap/contracts';

/** What the app knows now. Supported keys and the menu schema version come from the support declaration, not from here. */
export type DiagnoseContext = {
  capabilities: Pick<ViewCapabilities, 'canView' | 'reason'>;
  /** Equipment axis ids the app knows now. */
  knownAxisIds: readonly string[];
  /** Equipment ids the app can still resolve; omit when the app cannot tell (selection is then not checked). */
  knownSelectionIds?: readonly string[];
  /** A menu view records the metric version it was saved with in `chartOptions.metricVersion`. */
  currentMetricVersion?: number;
};

export type DiagnoseCode =
  | 'denied'
  | 'menu-mismatch'
  | 'stale-context-key'
  | 'stale-page-key'
  | 'menu-schema-version'
  | 'metric-version'
  | 'unknown-axis'
  | 'invalid-selection'
  | 'migration-unavailable';
export type DiagnoseReason = { code: DiagnoseCode; key?: string; message?: string };

export type Migration = { preview: ChangeLine[]; apply(): SavedView };

export type SavedViewDiagnosis =
  | { status: 'ok'; reasons: [] }
  | { status: 'denied'; reasons: DiagnoseReason[] }
  | {
      status: 'stale';
      reasons: DiagnoseReason[];
      /** Present only when the menu's own meaning-preserving upgrade exists; nothing changes before `apply()`. */
      migration?: Migration;
      /** Present when there is no safe upgrade: the saved conditions are kept as saved and the user picks again. */
      reselect?: { keep: SavedViewContext };
    };

const hasKey = (o: object, k: string) => Object.hasOwn(o, k);
const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function contextReasons(view: SavedView, support: SavedViewSupport, ctx: DiagnoseContext): DiagnoseReason[] {
  const reasons: DiagnoseReason[] = [];
  for (const key of Object.keys(view.context)) {
    if (!support.contextKeys.includes(key)) reasons.push({ code: 'stale-context-key', key });
  }
  const { condition, selection } = view.context;
  if (condition) {
    for (const axis of Object.keys(condition)) {
      if (!ctx.knownAxisIds.includes(axis)) reasons.push({ code: 'unknown-axis', key: axis });
    }
  }
  if (selection && ctx.knownSelectionIds) {
    const known = new Set(ctx.knownSelectionIds);
    for (const id of selection) if (!known.has(id)) reasons.push({ code: 'invalid-selection', key: id });
  }
  return reasons;
}

function menuReasons(view: MenuView, support: SavedViewSupport, ctx: DiagnoseContext): DiagnoseReason[] {
  const reasons: DiagnoseReason[] = [];
  if (view.menuId !== support.menuId) reasons.push({ code: 'menu-mismatch', key: view.menuId });
  if (view.menuSchemaVersion !== support.menuSchemaVersion) reasons.push({ code: 'menu-schema-version' });
  const pageKeys = Array.isArray(view.page) ? view.page.map(([k]) => k) : Object.keys(view.page);
  for (const key of new Set(pageKeys)) if (!support.pageKeys.includes(key)) reasons.push({ code: 'stale-page-key', key });
  const saved = hasKey(view.chartOptions, 'metricVersion') ? view.chartOptions.metricVersion : undefined;
  if (ctx.currentMetricVersion !== undefined && saved !== undefined && saved !== ctx.currentMetricVersion) reasons.push({ code: 'metric-version' });
  return reasons;
}

const sameSet = (x: readonly string[], y: readonly string[]) => x.length === y.length && new Set(x).size === new Set(y).size && x.every(v => y.includes(v));

/** Equal as a constraint: arrays and axis value lists compare as sets, `[]` (explicit empty) is not `null`, a missing key is not a value. */
function sameValue(x: unknown, y: unknown): boolean {
  if (Array.isArray(x) || Array.isArray(y)) return Array.isArray(x) && Array.isArray(y) && sameSet(x as string[], y as string[]);
  if (typeof x === 'object' && x !== null && typeof y === 'object' && y !== null) {
    const kx = Object.keys(x);
    return kx.length === Object.keys(y).length && kx.every(k => hasKey(y, k) && sameValue((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k]));
  }
  return x === y;
}

/**
 * An upgrade is meaning-preserving for the Context only if it returns exactly what was saved. A menu upgrade moves page keys,
 * chart options and layout; the library cannot prove that a changed Context value selects the same data, so any change
 * (narrowed, widened, swapped, nulled, `[]`→null, dropped or added key) falls back to reselect with the saved context kept.
 */
function changesContext(before: SavedViewContext, after: SavedViewContext): string | null {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (hasKey(before, key) !== hasKey(after, key)) return key;
    if (!sameValue((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key])) return key;
  }
  return null;
}

function migrationFor(view: MenuView, support: SavedViewSupport, ctx: DiagnoseContext): Migration | null {
  if (!support.migrate || view.menuId !== support.menuId || view.menuSchemaVersion >= support.menuSchemaVersion) return null;
  const { id, ownerId, version, updatedAt, visibility, approval, approvalNote, ...draft } = cloneJson(view) as MenuView & {
    visibility: SavedView['visibility'];
    approval: SavedView['approval'];
    approvalNote?: string;
  };
  const result = support.migrate(view.menuSchemaVersion, draft);
  if (!result.ok) return null;
  const next = result.view;
  if (next.menuId !== support.menuId || next.menuSchemaVersion !== support.menuSchemaVersion || next.kind !== 'menu-view') return null;
  if (changesContext(view.context, next.context)) return null;
  // The upgraded view must itself be free of the other stale reasons the app can see.
  const upgraded = { ...next, id, ownerId, version, updatedAt, visibility, approval, ...(approvalNote === undefined ? {} : { approvalNote }) } as SavedView;
  if (contextReasons(upgraded, support, ctx).length > 0 || menuReasons(upgraded as MenuView, support, ctx).length > 0) return null;
  const preview = cloneJson(result.preview);
  return { preview, apply: () => cloneJson(upgraded) };
}

/**
 * Pure check of a stored view against what the app knows now (06 §21.3). Never edits the saved conditions: an invalid axis
 * is not dropped to make the view unconstrained and an empty intersection is not turned into "all". Without a safe,
 * meaning-preserving upgrade the diagnosis keeps the saved context and asks the user to pick again.
 */
export function diagnoseSavedView(view: SavedView, support: SavedViewSupport, ctx: DiagnoseContext): SavedViewDiagnosis {
  if (!ctx.capabilities.canView) {
    return { status: 'denied', reasons: [{ code: 'denied', ...(ctx.capabilities.reason === undefined ? {} : { message: ctx.capabilities.reason }) }] };
  }
  const reasons = [...contextReasons(view, support, ctx), ...(view.kind === 'menu-view' ? menuReasons(view, support, ctx) : [])];
  if (reasons.length === 0) return { status: 'ok', reasons: [] };
  const migration = view.kind === 'menu-view' ? migrationFor(view, support, ctx) : null;
  if (migration) return { status: 'stale', reasons, migration };
  if (view.kind === 'menu-view' && view.menuSchemaVersion < support.menuSchemaVersion && support.migrate) reasons.push({ code: 'migration-unavailable' });
  return { status: 'stale', reasons, reselect: { keep: cloneJson(view.context) } };
}
