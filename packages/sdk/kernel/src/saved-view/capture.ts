import { buildQuery, isForbiddenSavedViewKey, parseQuery, RETURN_TO_KEY, shift, type ContextKey, type GlobalContext, type Pair, type SavedViewContext, type SavedViewSupport } from '@ap/contracts';

/** Menu-declared Context keys (`SavedViewSupport.contextKeys`) → the saved fields each one governs (06 §21.1). */
const FIELDS_OF: Record<string, readonly (keyof SavedViewContext)[]> = {
  time: ['from', 'to', 'relativePeriod'], roomNames: ['roomNames'], line: ['lineNames'], prcGroup: ['prcGroups', 'membershipBasis'],
  condition: ['condition', 'membershipBasis'], selection: ['selection'],
} satisfies Partial<Record<ContextKey, readonly (keyof SavedViewContext)[]>>;
export type SupportedKeys = Pick<SavedViewSupport, 'contextKeys' | 'pageKeys'>;
export type Applied = { global: GlobalContext; page: Pair[] };
export type SavedState = { context: SavedViewContext; page: Pair[] };

/** The saved fields this menu supports; everything else is reported as not applied (06 §6.4). */
export function supportedFields(support: SupportedKeys): ReadonlySet<keyof SavedViewContext> {
  return new Set(support.contextKeys.flatMap(key => FIELDS_OF[key] ?? []));
}
const savable = ([key]: Pair) => key !== RETURN_TO_KEY && !isForbiddenSavedViewKey(key);

/** Normalizes one page representation (pairs or key map) to sorted pairs so equal pages compare equal. */
export function pagePairs(page: Pair[] | Record<string, string[]>): Pair[] {
  const pairs: Pair[] = Array.isArray(page) ? page.map(([k, v]) => [k, v]) : Object.entries(page).flatMap(([k, vs]) => vs.map((v): Pair => [k, v]));
  return pairs.filter(([, value]) => value !== '').sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0));
}

/**
 * What a Saved View stores from the screen: the APPLIED Context and page keys the menu supports, never the draft (06 §21.1).
 * Callers pass `global`/`page` from the platform value (the address), not `queryDraft.draft`.
 */
export function captureApplied(applied: Applied, support: SupportedKeys): SavedState {
  const fields = supportedFields(support);
  const context: SavedViewContext = {};
  const put = <K extends keyof SavedViewContext>(key: K, value: SavedViewContext[K] | null) => { if (fields.has(key) && value !== null && value !== undefined) context[key] = value; };
  const g = applied.global;
  if (g.from !== null && g.to !== null) { put('from', g.from); put('to', g.to); }
  put('roomNames', g.roomNames); put('lineNames', g.lineNames); put('prcGroups', g.prcGroups); put('selection', g.selection);
  put('condition', g.condition); put('membershipBasis', g.membershipBasis);
  return { context, page: pagePairs(applied.page.filter(pair => support.pageKeys.includes(pair[0]) && savable(pair))) };
}

/** A saved relative period becomes an absolute window from the server anchor (and is left unresolved when there is none); everything else is already absolute. */
export function resolveContext(context: SavedViewContext, anchor: string | null): SavedViewContext {
  const { relativePeriod, ...rest } = context;
  // No server anchor (ADR-0098): a relative period has nothing to resolve against and is left out, never dated from the browser clock.
  return relativePeriod && anchor !== null ? { ...rest, from: shift(anchor, -relativePeriod.hours), to: anchor } : rest;
}

/** Canonical text of a state, so two states are equal exactly when their address would be. */
export function stateKey(state: SavedState): string {
  const g = parseQuery(buildQuery({ ...EMPTY, ...(state.context as Partial<GlobalContext>) } as GlobalContext, state.page), state.page.map(([k]) => k)).global;
  return JSON.stringify([buildQuery(g), pagePairs(state.page)]);
}
const EMPTY: GlobalContext = { scopeId: null, from: null, to: null, roomNames: null, condition: null, lineNames: null, prcGroups: null, membershipBasis: null, selection: null, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null };

export type ViewState = {
  /** 수정됨: a view is selected and the applied conditions differ from its saved copy. */
  modified: boolean;
  /** 저장되지 않은 변경: applied conditions that would be lost on a view switch (modified, or content with no view selected). */
  unsaved: boolean;
  /** 미적용 변경: the draft differs from the applied conditions (a different thing from both above). */
  unapplied: boolean;
};
/** The three states the selector shows; they never merge (06 §21.3). `saved` is the selected view resolved at `anchor`, null without a selection. */
export function viewState(input: { applied: SavedState; saved: SavedState | null; draftDirty: readonly string[] }): ViewState {
  const same = input.saved !== null && stateKey(input.applied) === stateKey(input.saved);
  const hasContent = Object.keys(input.applied.context).length > 0 || input.applied.page.length > 0;
  const modified = input.saved !== null && !same;
  return { modified, unsaved: modified || (input.saved === null && hasContent), unapplied: input.draftDirty.length > 0 };
}
