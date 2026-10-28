import { buildQuery, emptyGlobal, RETURN_TO_KEY, type GlobalContext, type Pair, type SavedView, type SavedViewContext, type SavedViewSupport } from '@ap/contracts';
import { resolveContext, supportedFields, type Applied, type SavedState } from './capture';

/** Saved field → the Context key the user reads in the 적용되지 않음 list. */
const KEY_OF: Record<keyof SavedViewContext, string> = { from: 'time', to: 'time', relativePeriod: 'time', roomNames: 'roomNames', lineNames: 'line', prcGroups: 'prcGroup', condition: 'condition', membershipBasis: 'condition', selection: 'selection' };
export type Unsupported = { kind: 'context' | 'page'; key: string };
export type RestoreSource = 'selected' | 'default';
export type RestoreFailure = 'wrong-menu' | 'stale-schema';
export type RestoreResult =
  | { ok: true; applied: true; next: Applied; href: string; unsupported: Unsupported[] }
  /** The default view yields to an explicit address (06 §6.4, §21.3): nothing is written and no key is filled in. */
  | { ok: true; applied: false; reason: 'explicit-address' }
  | { ok: false; reason: RestoreFailure };

/** True when the address already carries Context or page keys. A bare route is the only place a personal default may apply. */
export function hasExplicitContext(current: Applied): boolean {
  const { scopeId: _scope, ...keys } = current.global;
  return Object.values(keys).some(value => value !== null) || current.page.some(([key]) => key !== RETURN_TO_KEY);
}

/** The saved copy restricted to what this menu supports, with a relative period resolved: the shape `viewState` compares with the applied state. */
export function savedStateOf(view: SavedView, support: SavedViewSupport, anchor: string | null): SavedState {
  const fields = supportedFields(support);
  const context: SavedViewContext = {};
  for (const [key, value] of Object.entries(resolveContext(view.context, anchor)) as [keyof SavedViewContext, never][]) if (fields.has(key)) context[key] = value;
  const page = view.kind === 'menu-view' ? savedPage(view) : [];
  return { context, page: page.filter(([key]) => support.pageKeys.includes(key)) };
}

/** What a view stores that this menu cannot restore (06 §6.4): derived from the saved copy, so it is the same right after a pick and after a reload. */
export function unsupportedOf(view: SavedView, support: SavedViewSupport, anchor: string | null): Unsupported[] {
  const fields = supportedFields(support);
  const found: Unsupported[] = [];
  const note = (item: Unsupported) => { if (!found.some(u => u.kind === item.kind && u.key === item.key)) found.push(item); };
  for (const field of Object.keys(resolveContext(view.context, anchor)) as (keyof SavedViewContext)[]) if (!fields.has(field)) note({ kind: 'context', key: KEY_OF[field] });
  if (view.kind === 'menu-view') for (const [key] of savedPage(view)) if (!support.pageKeys.includes(key)) note({ kind: 'page', key });
  return found;
}

/** The applied state as compared with a saved copy: a condition set saves Context only, so the page is not part of its "modified" (06 §21.1). */
export function comparableApplied(view: SavedView, applied: SavedState): SavedState {
  return view.kind === 'condition-set' ? { context: applied.context, page: [] } : applied;
}

/**
 * Applies a view to the current address: supported keys are replaced by the view, unsupported ones are listed and left out, other page
 * keys and `extras` stay as they are. A `default` source applies only to a bare route. Pure: the caller writes `href` with one `replace` (default) or a push (picked).
 */
export function restoreSavedView(input: { view: SavedView; support: SavedViewSupport; current: Applied; extras: Pair[]; pathname: string; anchor: string | null; source: RestoreSource }): RestoreResult {
  const { view, support, current } = input;
  if (view.kind === 'menu-view' && view.menuId !== support.menuId) return { ok: false, reason: 'wrong-menu' };
  if (view.kind === 'menu-view' && view.menuSchemaVersion !== support.menuSchemaVersion) return { ok: false, reason: 'stale-schema' };
  if (input.source === 'default' && hasExplicitContext(current)) return { ok: true, applied: false, reason: 'explicit-address' };
  const fields = supportedFields(support);
  const resolved = resolveContext(view.context, input.anchor);
  const global: GlobalContext = { ...current.global };
  const clear = (field: keyof SavedViewContext) => { if (field !== 'relativePeriod') (global as Record<string, unknown>)[FIELD_TO_GLOBAL[field]] = emptyGlobal[FIELD_TO_GLOBAL[field]]; };
  for (const field of fields) clear(field);
  for (const [field, value] of Object.entries(resolved) as [keyof SavedViewContext, unknown][]) {
    if (fields.has(field)) (global as Record<string, unknown>)[FIELD_TO_GLOBAL[field as Exclude<keyof SavedViewContext, 'relativePeriod'>]] = value;
  }
  const saved = savedStateOf(view, support, input.anchor);
  let page = current.page;
  if (view.kind === 'menu-view') {
    page = [...current.page.filter(([key]) => !support.pageKeys.includes(key)), ...saved.page];
  }
  const next: Applied = { global, page };
  return { ok: true, applied: true, next, href: input.pathname + buildQuery(next.global, next.page, input.extras), unsupported: unsupportedOf(view, support, input.anchor) };
}

const FIELD_TO_GLOBAL = { from: 'from', to: 'to', roomNames: 'roomNames', lineNames: 'lineNames', prcGroups: 'prcGroups', condition: 'condition', membershipBasis: 'membershipBasis', selection: 'selection', relativePeriod: 'from' } as const;
function savedPage(view: Extract<SavedView, { kind: 'menu-view' }>): Pair[] {
  return Array.isArray(view.page) ? view.page : Object.entries(view.page).flatMap(([k, vs]) => vs.map((v): Pair => [k, v]));
}
