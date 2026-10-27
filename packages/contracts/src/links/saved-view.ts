import type { GlobalContext, Pair } from './url.js';

/** Anything JSON.stringify round-trips; saved payloads never hold functions, undefined or cycles. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type SavedViewKind = 'condition-set' | 'menu-view';

/**
 * Serializable partial map of the supported Context keys. Scope is not saved: restore re-validates it on the server.
 * A relative period (`hours` back from the server anchor) and an absolute `from`/`to` are different rules.
 */
export type SavedViewContext = Partial<Pick<GlobalContext, 'from' | 'to' | 'condition' | 'selection' | 'membershipBasis' | 'lineNames' | 'prcGroups' | 'roomNames'>> & {
  relativePeriod?: { hours: number };
};

export type SavedViewBase = { id: string; schemaVersion: 1; kind: SavedViewKind; name: string; ownerId: string; version: number; updatedAt: number };
export type ConditionSetView = SavedViewBase & { kind: 'condition-set'; context: SavedViewContext };
export type MenuView = SavedViewBase & {
  kind: 'menu-view';
  menuId: string;
  menuSchemaVersion: number;
  context: SavedViewContext;
  /** Page-owned URL keys, in the existing URL codec shape. */
  page: Pair[] | Record<string, string[]>;
  chartOptions: Record<string, JsonValue>;
  /** Engine-neutral arrangement; never an engine's raw JSON. */
  layout: JsonValue;
  /** Opaque slot (#911): validation does not read the content. */
  panels: unknown;
};

export type ViewVisibility = { kind: 'private' } | { kind: 'people'; userIds: string[] } | { kind: 'groups'; groupIds: string[] } | { kind: 'official' };
export type ViewApproval = 'none' | 'pending' | 'approved' | 'rejected';
/** Visibility and approval are separate fields; a personal default is a user setting (`getDefaultId`), not a view field. */
export type ViewSharing = { visibility: ViewVisibility; approval: ViewApproval; approvalNote?: string };
export type SavedView = (ConditionSetView | MenuView) & ViewSharing;

/** What a caller proposes to save; the store assigns id, owner, version, time and starts private with approval `none`. */
export type ConditionSetDraft = { schemaVersion: 1; kind: 'condition-set'; name: string; context: SavedViewContext };
export type MenuViewDraft = Omit<MenuView, 'id' | 'ownerId' | 'version' | 'updatedAt'>;
export type SavedViewDraft = ConditionSetDraft | MenuViewDraft;
export type SavedViewPatch = { name?: string; context?: SavedViewContext; page?: MenuView['page']; chartOptions?: MenuView['chartOptions']; layout?: JsonValue; panels?: unknown };

export type ViewGroup = { id: string; kind: 'org-team' | 'custom'; name: string; memberCount: number; managerIds?: string[] };
/** `affiliation` tells same-named people apart in people search and member lists. */
export type GroupMember = { userId: string; displayName: string; affiliation: string };

/** Per-object actions the store computes; the UI is built from these, never from a single role. */
export type ViewCapabilities = { canView: boolean; canCopy: boolean; canEdit: boolean; canShare: boolean; canApprove: boolean; canRevoke: boolean; reason?: string };
/** An org team has `canEditMembers: false`. */
export type GroupCapabilities = { canView: boolean; canEditMembers: boolean; canRename: boolean; canDelete: boolean };

/** Out of permission: no name, no content, only why. */
export type DeniedSavedView = { id: string; denied: true; reason: string };
export type SavedViewEntry = { denied?: false; view: SavedView; capabilities: ViewCapabilities };
export type SavedViewListItem = SavedViewEntry | DeniedSavedView;
export type ViewGroupEntry = { group: ViewGroup; members: readonly GroupMember[]; capabilities: GroupCapabilities };

/** A failed or conflicting call leaves the stored state unchanged. */
export type Result<T> = { ok: true; value: T } | { ok: false; reason: 'conflict' | 'forbidden' | 'unavailable' | 'invalid'; detail?: string };

/** `menuId: null` lists condition sets. */
export type SavedViewKey = { userId: string; menuId: string | null };
export type ExpectedVersion = { expectedVersion: number };

/** Async port injected into the provider like QueryHistoryStore (not a server adapter). */
export type SavedViewStore = {
  list(key: SavedViewKey): Promise<readonly SavedViewListItem[]>;
  get(id: string): Promise<SavedViewListItem | null>;
  save(input: SavedViewDraft): Promise<Result<SavedViewEntry>>;
  update(id: string, patch: SavedViewPatch, opts: ExpectedVersion): Promise<Result<SavedViewEntry>>;
  remove(id: string): Promise<Result<null>>;
  setDefault(key: SavedViewKey, id: string | null): Promise<Result<null>>;
  getDefaultId(key: SavedViewKey): Promise<string | null>;
  setVisibility(id: string, visibility: ViewVisibility, opts: ExpectedVersion): Promise<Result<SavedViewEntry>>;
  /** Takes no visibility: asking for approval never changes who can see the view. */
  requestOfficial(id: string, opts: ExpectedVersion): Promise<Result<SavedViewEntry>>;
  decide(id: string, decision: 'approve' | 'reject', note: string | undefined, opts: ExpectedVersion): Promise<Result<SavedViewEntry>>;
  revoke(id: string, opts: ExpectedVersion): Promise<Result<SavedViewEntry>>;
  listGroups(): Promise<readonly ViewGroupEntry[]>;
  createGroup(input: { name: string; memberIds: string[] }): Promise<Result<ViewGroupEntry>>;
  updateGroup(id: string, patch: { name?: string; addMembers?: string[]; removeMembers?: string[] }): Promise<Result<ViewGroupEntry>>;
  searchPeople(query: string, signal: AbortSignal): Promise<readonly GroupMember[]>;
};

export type ChangeLine = { key: string; before: JsonValue; after: JsonValue; note?: string };
export type MigrateResult = { ok: true; view: MenuViewDraft; preview: ChangeLine[] } | { ok: false; reason: string };

/** A menu declares what it can save; Kernel consumes it. */
export type SavedViewSupport = {
  menuId: string;
  menuSchemaVersion: number;
  contextKeys: readonly string[];
  pageKeys: readonly string[];
  /** Turns page-key values into a serializable form. */
  serialize?(page: Record<string, unknown>): Record<string, JsonValue>;
  /** Meaning-preserving upgrade of a view saved at `from`; the preview is shown before the user confirms. */
  migrate?(from: number, view: MenuViewDraft): MigrateResult;
};

export type ApprovalAction = 'request' | 'approve' | 'reject' | 'revoke';
/** Allowed transitions: none→pending, pending→approved|rejected, approved→none, rejected→pending (re-application is also `request`). */
export const APPROVAL_TRANSITIONS: Readonly<Record<ApprovalAction, { from: readonly ViewApproval[]; to: ViewApproval }>> = {
  request: { from: ['none', 'rejected'], to: 'pending' },
  approve: { from: ['pending'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  revoke: { from: ['approved'], to: 'none' },
};
/** Visibility is not an input. */
export function canTransition(approval: ViewApproval, action: ApprovalAction): boolean {
  return APPROVAL_TRANSITIONS[action].from.includes(approval);
}

/** Transient UI state and raw data/engine dumps that must never be saved (21.1). Matched by key name at any depth outside `panels`. */
const TRANSIENT_KEY = /^(hover|zoom|modal|openModal|draft)/i;
const RAW_KEYS: ReadonlySet<string> = new Set(['rows', 'rawData', 'dockview', 'engineState']);
export const isForbiddenSavedViewKey = (key: string): boolean => TRANSIENT_KEY.test(key) || RAW_KEYS.has(key);

const invalid = (detail: string): Result<never> => ({ ok: false, reason: 'invalid', detail });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function nonSerializable(value: unknown, path: string, ancestors: unknown[]): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path}: non-finite number`;
  if (typeof value !== 'object') return `${path}: ${typeof value} is not serializable`;
  if (ancestors.includes(value)) return `${path}: circular reference`;
  if (!Array.isArray(value)) { const proto = Object.getPrototypeOf(value); if (proto !== Object.prototype && proto !== null) return `${path}: not a plain object`; }
  for (const [k, v] of Object.entries(value)) { const bad = nonSerializable(v, `${path}.${k}`, [...ancestors, value]); if (bad) return bad; }
  return null;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const isNullOr = (check: (v: unknown) => boolean) => (v: unknown) => v === null || check(v);
const CONTEXT_SHAPES: Record<string, (v: unknown) => boolean> = {
  from: isNullOr(v => typeof v === 'string'),
  to: isNullOr(v => typeof v === 'string'),
  selection: isNullOr(isStringArray),
  lineNames: isNullOr(isStringArray),
  prcGroups: isNullOr(isStringArray),
  roomNames: isNullOr(isStringArray),
  membershipBasis: v => v === null || v === 'asOf',
  condition: isNullOr(v => isObject(v) && Object.values(v).every(axis => isStringArray(axis) && axis.length > 0)),
  relativePeriod: v => isObject(v) && Object.keys(v).length === 1 && typeof v.hours === 'number' && Number.isFinite(v.hours),
};

function invalidContext(context: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(context)) {
    const shape = Object.hasOwn(CONTEXT_SHAPES, k) ? CONTEXT_SHAPES[k] : undefined;
    if (!shape) return `context.${k} is not a savable key`;
    if (!shape(v)) return `context.${k} has the wrong shape`;
  }
  return null;
}

/** Both page representations (pairs and key map) get the same logical-key rule and value shape. */
function invalidPage(page: unknown): string | null {
  if (Array.isArray(page)) {
    for (const [i, pair] of page.entries()) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return `page[${i}] must be a [key, value] pair`;
      if (isForbiddenSavedViewKey(pair[0])) return `page.${pair[0]} must not be saved`;
    }
    return null;
  }
  for (const [k, v] of Object.entries(page as Record<string, unknown>)) {
    if (isForbiddenSavedViewKey(k)) return `page.${k} must not be saved`;
    if (!isStringArray(v)) return `page.${k} must be a string array`;
  }
  return null;
}

function forbiddenKey(value: unknown, path: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  for (const [k, v] of Object.entries(value)) {
    if (!Array.isArray(value) && isForbiddenSavedViewKey(k)) return `${path}.${k}`;
    const bad = forbiddenKey(v, `${path}.${k}`);
    if (bad) return bad;
  }
  return null;
}

/** Pure check of a draft before it is saved. `panels` is opaque: only its serializability is checked, never its content. */
export function validateSavedView(input: unknown): Result<SavedViewDraft> {
  if (!isObject(input)) return invalid('view must be an object');
  if (input.schemaVersion !== 1) return invalid('unknown schemaVersion');
  if (typeof input.name !== 'string' || input.name.trim() === '') return invalid('name is empty');
  if (!isObject(input.context)) return invalid('context must be an object');
  const badContext = invalidContext(input.context);
  if (badContext) return invalid(badContext);
  const menuOnly = ['page', 'chartOptions', 'layout', 'panels'];
  if (input.kind === 'condition-set') {
    const extra = menuOnly.find(k => k in input);
    if (extra) return invalid(`a condition set has no ${extra}`);
  } else if (input.kind === 'menu-view') {
    if (typeof input.menuId !== 'string' || input.menuId === '') return invalid('menuId is required');
    if (typeof input.menuSchemaVersion !== 'number' || !Number.isInteger(input.menuSchemaVersion)) return invalid('menuSchemaVersion is required');
    if (!Array.isArray(input.page) && !isObject(input.page)) return invalid('page must be pairs or a key map');
    const badPage = invalidPage(input.page);
    if (badPage) return invalid(badPage);
    if (!isObject(input.chartOptions)) return invalid('chartOptions must be an object');
    if (!('layout' in input) || !('panels' in input)) return invalid('layout and panels are required');
  } else return invalid('unknown kind');
  for (const [k, v] of Object.entries(input)) {
    const bad = nonSerializable(v, k, [input]);
    if (bad) return invalid(bad);
    if (isForbiddenSavedViewKey(k)) return invalid(`${k} must not be saved`);
    const key = k === 'panels' ? null : forbiddenKey(v, k);
    if (key) return invalid(`${key} must not be saved`);
  }
  return { ok: true, value: input as SavedViewDraft };
}
