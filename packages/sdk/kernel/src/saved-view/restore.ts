import { buildQuery, emptyGlobal, RETURN_TO_KEY, type GlobalContext, type Pair, type SavedView, type SavedViewContext, type SavedViewPatch, type SavedViewSupport } from '@ap/contracts';
import { SITE_BOUND_FIELDS } from '../context/siteBound';
import { pagePairs, resolveContext, supportedFields, type Applied, type SavedState } from './capture';

/** Saved field → the Context key the user reads in the 적용되지 않음 list. */
const KEY_OF: Record<keyof SavedViewContext, string> = { from: 'time', to: 'time', relativePeriod: 'time', roomNames: 'roomNames', lineNames: 'line', prcGroups: 'prcGroup', condition: 'condition', membershipBasis: 'condition', selection: 'selection' };
export type Unsupported = { kind: 'context' | 'page'; key: string };
/** The saved fields that are Site-bound: the Kernel's Site-bound list (the one a Scope change clears) restricted to what a view can hold (#2175). */
const SAVED_FIELDS: ReadonlySet<string> = new Set<keyof SavedViewContext>(['from', 'to', 'condition', 'selection', 'membershipBasis', 'lineNames', 'prcGroups', 'roomNames', 'relativePeriod']);
const SITE_BOUND_SAVED = SITE_BOUND_FIELDS.filter(field => SAVED_FIELDS.has(field)) as (keyof SavedViewContext)[];

/** Whether the Scope a view's content was saved in differs from `scopeId` (a view with no recorded Scope never does; no current Scope against a recorded one does). */
export const savedInOtherScope = (view: Pick<SavedView, 'savedScopeId'>, scopeId: string | null): boolean => view.savedScopeId !== undefined && view.savedScopeId !== scopeId;

/**
 * The Site-bound fields this view stores but must not apply in `scopeId`: the one rule of #2175. A pure function of the view and the CURRENT Scope, so opening a view in
 * another Scope, switching Scope while it is selected, the notice, `수정됨` and `저장본으로 되돌리기` all give the same answer, and a reload does too.
 */
export function siteBoundDropped(view: Pick<SavedView, 'savedScopeId' | 'context'>, scopeId: string | null): (keyof SavedViewContext)[] {
  if (!savedInOtherScope(view, scopeId)) return [];
  return SITE_BOUND_SAVED.filter(field => view.context[field] !== undefined && view.context[field] !== null);
}
export type RestoreSource = 'selected' | 'default';
export type RestoreFailure = 'wrong-menu' | 'stale-schema';
export type RestoreResult =
  | { ok: true; applied: true; next: Applied; href: string; unsupported: Unsupported[]; /** Context keys (as the user reads them) a view saved in another Scope did not apply here. */ excludedByScope: string[] }
  /** The default view yields to an explicit address (06 §6.4, §21.3): nothing is written and no key is filled in. */
  | { ok: true; applied: false; reason: 'explicit-address' }
  | { ok: false; reason: RestoreFailure };

/** True when the address already carries Context or page keys. A bare route is the only place a personal default may apply. */
export function hasExplicitContext(current: Applied): boolean {
  const { scopeId: _scope, ...keys } = current.global;
  return Object.values(keys).some(value => value !== null) || current.page.some(([key]) => key !== RETURN_TO_KEY);
}

/** The saved copy restricted to what this menu supports, with a relative period resolved and the Site-bound values of another Scope left out: the shape `viewState` compares with the applied state. */
export function savedStateOf(view: SavedView, support: SavedViewSupport, anchor: string | null, scopeId: string | null): SavedState {
  const fields = supportedFields(support);
  const dropped = new Set<string>(siteBoundDropped(view, scopeId));
  const context: SavedViewContext = {};
  for (const [key, value] of Object.entries(resolveContext(view.context, anchor)) as [keyof SavedViewContext, never][]) if (fields.has(key) && !dropped.has(key)) context[key] = value;
  const page = view.kind === 'menu-view' ? savedPage(view) : [];
  return { context, page: page.filter(([key]) => support.pageKeys.includes(key)) };
}

/** Saved fields as the Context keys the user reads in a notice or confirmation, each key once (`membershipBasis` reads as `condition`). */
export const contextKeysOf = (fields: readonly (keyof SavedViewContext)[]): string[] => [...new Set(fields.map(field => KEY_OF[field]))];

/** The Context keys (as the user reads them in the notice) a view saved in another Scope does not apply in this menu. Fields the menu does not support are listed by `unsupportedOf`, not here. */
export function excludedByScope(view: SavedView, support: SavedViewSupport, scopeId: string | null): string[] {
  const fields = supportedFields(support);
  return contextKeysOf(siteBoundDropped(view, scopeId).filter(field => fields.has(field)));
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
  const dropped = new Set<string>(siteBoundDropped(view, current.global.scopeId));
  const global: GlobalContext = { ...current.global };
  const clear = (field: keyof SavedViewContext) => { if (field !== 'relativePeriod') (global as Record<string, unknown>)[FIELD_TO_GLOBAL[field]] = emptyGlobal[FIELD_TO_GLOBAL[field]]; };
  for (const field of fields) clear(field);
  for (const [field, value] of Object.entries(resolved) as [keyof SavedViewContext, unknown][]) {
    if (fields.has(field) && !dropped.has(field)) (global as Record<string, unknown>)[FIELD_TO_GLOBAL[field as Exclude<keyof SavedViewContext, 'relativePeriod'>]] = value;
  }
  const saved = savedStateOf(view, support, input.anchor, current.global.scopeId);
  let page = current.page;
  if (view.kind === 'menu-view') {
    page = [...current.page.filter(([key]) => !support.pageKeys.includes(key)), ...saved.page];
  }
  const next: Applied = { global, page };
  return { ok: true, applied: true, next, href: input.pathname + buildQuery(next.global, next.page, input.extras), unsupported: unsupportedOf(view, support, input.anchor), excludedByScope: excludedByScope(view, support, current.global.scopeId) };
}

/**
 * The patch of 현재 뷰에 저장 (#2031): stores replace `context` and `page` wholesale, so the patch is complete. Saved fields and page keys this menu does
 * not support stay as stored (06 §21.1); supported ones take the applied value, an emptied one is cleared. A relative period whose window the user
 * did not change (applied `from`/`to` equal the view resolved at `anchor`, as the restore did) stays relative; a changed window is saved absolute.
 * The shared `membershipBasis` stays as stored while the view holds an owner (`condition`/`prcGroups`) this menu does not support (06 §21.3).
 * Saved from another Scope than the view's (#2175): the stored Site-bound fields are NOT kept, supported or not, because they describe the other Scope's Site and
 * would be relabelled as this one's; only what the applied state holds is written. The patch always records the current Scope (`null` clears it, when there is none).
 */
export function overwritePatch(view: SavedView, applied: SavedState, support: SavedViewSupport, anchor: string | null, scopeId: string | null): Pick<SavedViewPatch, 'context' | 'page' | 'savedScopeId'> {
  const fields = supportedFields(support);
  const cross = savedInOtherScope(view, scopeId);
  const kept = Object.fromEntries(Object.entries(view.context).filter(([field]) => !fields.has(field as keyof SavedViewContext) && !(cross && (SITE_BOUND_SAVED as readonly string[]).includes(field)))) as SavedViewContext;
  let context: SavedViewContext = { ...kept, ...applied.context };
  // `membershipBasis` is shared by `condition` and `prcGroups`: support of one owner is no write authority over a stored owner this menu hides.
  // The stored basis stays (absent = current membership), whatever the applied one says — the address drops a basis with no owner, and an
  // explicit edit would recast the hidden owner, so that edit is not saved into this view (it keeps reading 수정됨).
  if (!cross && ((view.context.condition && !fields.has('condition')) || (view.context.prcGroups && !fields.has('prcGroups')))) {
    const { membershipBasis: _basis, ...rest } = context;
    context = view.context.membershipBasis === undefined ? rest : { ...rest, membershipBasis: view.context.membershipBasis };
  }
  const { relativePeriod } = view.context;
  if (relativePeriod && fields.has('relativePeriod') && anchor !== null) {
    const resolved = resolveContext(view.context, anchor);
    if (applied.context.from === resolved.from && applied.context.to === resolved.to) {
      const { from: _from, to: _to, ...rest } = context;
      context = { ...rest, relativePeriod };
    }
  }
  if (view.kind !== 'menu-view') return { context, savedScopeId: scopeId };
  return { context, savedScopeId: scopeId, page: pagePairs([...savedPage(view).filter(([key]) => !support.pageKeys.includes(key)), ...applied.page]) };
}

const FIELD_TO_GLOBAL ={ from: 'from', to: 'to', roomNames: 'roomNames', lineNames: 'lineNames', prcGroups: 'prcGroups', condition: 'condition', membershipBasis: 'membershipBasis', selection: 'selection', relativePeriod: 'from' } as const;
function savedPage(view: Extract<SavedView, { kind: 'menu-view' }>): Pair[] {
  return Array.isArray(view.page) ? view.page : Object.entries(view.page).flatMap(([k, vs]) => vs.map((v): Pair => [k, v]));
}
