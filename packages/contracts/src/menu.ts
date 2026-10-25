import type { Text } from './i18n.js';

/**
 * Menu manifest metadata (docs/06 §5): menus declare, the shell consumes. Field names are Candidates.
 * Render bindings (icon, page component) are React-bound and live in the kernel's MenuEntry.
 */
export type ContextKey = 'time' | 'roomNames' | 'line' | 'prcGroup' | 'condition' | 'selection' | 'lot' | 'ppid' | 'recipe' | 'metric';
/** apply = direct query filter · reference = carried/visible, not a query filter · unsupported = preserved, not applied */
export type Capability = 'apply' | 'reference' | 'unsupported';
/**
 * A manifest's `context` record: every key `unsupported` except the ones the menu declares (06 §5). Returns a new object per call.
 * The base Record lists every ContextKey, so a new key fails typecheck here once instead of in every menu.
 */
export function contextCapabilities(declared: Partial<Record<ContextKey, Capability>> = {}): Record<ContextKey, Capability> {
  return {
    time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
    lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported', ...declared,
  };
}
/** A manifest's `features` with every flag off (`board` absent = false). Spread it to turn one on: `{ ...NO_FEATURES, export: true }`. */
export const NO_FEATURES: Readonly<MenuMeta['features']> = Object.freeze({ export: false, savedView: false, annotate: false, compare: false });
export type PageType = 'overview' | 'analysis' | 'management' | 'catalog' | 'workflow';
declare const brand: unique symbol;
type Brand<Name extends string> = string & { readonly [brand]: Name };
/**
 * Menu vocabulary is open (ADR-0072): the app declares its groups, spaces and menu permissions and `createRegistry` checks them at startup.
 * The brand keeps a plain string, or an id of another kind, out of these slots at compile time. A module group is `<moduleId>:<name>` (ADR-0053).
 */
export type GroupId = Brand<'GroupId'>;
export type SpaceId = Brand<'SpaceId'>;
/** A permission a menu app declares; the platform's own are `KernelPermission`. */
export type MenuPermission = Brand<'MenuPermission'>;
/** Identity casts that keep the literal, so an app derives narrow types from its own declarations. Shape checks belong to `createRegistry`. */
export const groupId = <const S extends string>(id: S) => id as S & GroupId;
export const spaceId = <const S extends string>(id: S) => id as S & SpaceId;
export const menuPermission = <const S extends string>(id: S) => id as S & MenuPermission;
/** Sidebar-visible group set + entry permission (06 §9.1). Groups declare membership via GroupDef.space, menus never do. */
export type SpaceDef = {
  id: SpaceId;
  label: Text;
  /** Optional second line under the system name in lists that describe systems (launcher card, switcher row). Short places show the label only. Registry rejects an empty ko or en string when present. */
  subtitle?: Text;
  /** One-line purpose on the platform-home card (ADR-0028). Registry rejects an empty ko or en string. */
  description: Text;
  /** Entry permission; absent means every signed-in user (analytics). */
  permission?: Permission;
  /** Landing menu inside this space whose path has no `:param`. */
  homeMenuId: string;
  /** Page keys that stay in the URL when the user moves between menus of this space (ADR-0081 decision 4, 06 §6.4 exception): e.g. a list scope the whole space shares. Only keys a target menu declares in `pageKeys` are carried; the registry rejects a global key and a member menu that does not declare every carried key. Absent → nothing is carried (page-owned state stays per menu). */
  carriedPageKeys?: readonly string[];
};
/** Permissions the platform's own features judge, whatever app is assembled — emitted to `vocab.json` for servers outside this workspace (#674). Canonical order. */
export const KERNEL_PERMISSIONS = ['platform:view', 'notice:view', 'voc:view', 'console:access', 'feedbackops:access'] as const;
export type KernelPermission = typeof KERNEL_PERMISSIONS[number];
export type Permission = KernelPermission | MenuPermission;

/** One drill step: a page key plus the name the path bar shows (06 §6.4, ADR-0025). */
export type DrillLevel = { key: string; label: Text };

/** One selectable axis set of a menu's Condition (`MenuMeta.conditionPresets`, 06 §6.4, ADR-0083). `axes` are equipment axis ids. */
export type ConditionPreset = { id: string; label: Text; axes: readonly string[] };

/** One sidebar sub-item of a menu (`MenuMeta.navViews`). */
export type NavView = { id: string; label: Text; page: Readonly<Record<string, string>> };

export type MenuMeta = {
  id: string;
  group: GroupId;
  label: Text;
  description: Text;
  /** Route pattern; `:name` segments become params. */
  path: string;
  permission: Permission;
  /** Scope must be selected and server-validated before this page queries data. */
  requiresScope: boolean;
  context: Record<ContextKey, Capability>;
  /** Opt-in deferred analysis execution. The address remains the applied query. */
  query?: { mode: 'apply'; required?: { context?: readonly ContextKey[]; page?: readonly { key: string; label: Text }[] } };
  pageType: PageType;
  features: { export: boolean; savedView: boolean; annotate: boolean; compare: boolean; /** The menu can be shown in an analysis-board pane (ADR-0049). Absent = false. */ board?: boolean };
  /** Registered page-owned URL keys (§6.1). Only these survive on this route besides globals/extras. */
  pageKeys: readonly string[];
  /**
   * Subset of `pageKeys` that a deliberate global-Context change clears (e.g. the result-set page index).
   * The kernel drops them from the page pairs in the SAME navigation as `setGlobal`/`resetContext`.
   * History traversal (popstate, `navigate`, Back/Forward) never clears them — restored entries are exact (§6.4).
   */
  contextResetKeys?: readonly string[];
  /** Id-only metricId is completed from PUBLISHED_METRICS. Every other menu rejects it as metric_pair_incomplete. */
  initializesMetric?: boolean;
  /** Detail/destination routes are reachable through Context Links, not the sidebar. */
  navHidden?: boolean;
  /**
   * Sub-items drawn under this menu's sidebar row (expanded sidebar only; 06 §8, ADR-0081). Each view links to this menu with its `page` preset.
   * Each preset has at least one key; keys must be declared `pageKeys`, not a space `carriedPageKeys` entry (those follow the current screen) and not `focus`; ids are unique
   * within the menu; labels are non-blank ko/en; a `navHidden` menu has none. A view is current when every preset key equals the URL's page value.
   * Views are not palette entries and not favorite/recent targets.
   */
  navViews?: readonly NavView[];
  /**
   * Axis sets the menu can view its Condition through (06 §6.4, ADR-0083; field names Candidate). A preset narrows only what the menu
   * sends and what identifies its query: the global Condition, the URL `equipmentGroup`, pane copy and history stay whole.
   * At least 2 presets with unique ids, non-blank ko/en labels and non-empty `axes`; needs `conditionPreset`, and `context.condition` is `apply` or `reference`.
   * Each axis id must exist in the app's `equipmentAxes` (the Provider checks it).
   */
  conditionPresets?: readonly ConditionPreset[];
  /** The page key that holds the active preset id and the id used when it is absent or unknown. The key must be a declared `pageKeys` entry. */
  conditionPreset?: { key: string; default: string };
  /** Parent menu for breadcrumb/active-nav on detail routes. */
  parent?: string;
  /** Group's representative destination for the home group cards (08; field name Candidate, 06 §5). Exactly one per group. */
  primary?: boolean;
  /**
   * Ordered in-page drill (06 §6.4, ADR-0025). Each level key must also be a `pageKey` and a `contextResetKey`.
   * One or more levels, no upper bound (ADR-0063). `returnTo` is not a level key. Values stay page-owned and are not promoted to global Context.
   * `resetKeys` (field name Candidate): other `pageKeys` entries bound to the drill path (e.g. a picked row). A `setPage` write that changes
   * the value of any level key drops them in the SAME navigation (one history entry), so enter, breadcrumb and `goTo` all clear them.
   * A reset key the same patch sets explicitly keeps that value. Writes that leave every level value unchanged drop nothing.
   * History traversal (popstate, `navigate`, Back/Forward) never clears them — restored entries are exact (§6.4). Each entry must be a
   * declared `pageKeys` entry, not a level key and not `returnTo`; it need not be a `contextResetKeys` entry.
   */
  drill?: { levels: readonly DrillLevel[]; resetKeys?: readonly string[] };
};
