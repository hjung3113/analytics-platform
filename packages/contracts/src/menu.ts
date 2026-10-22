import type { Text } from './i18n.js';

/**
 * Menu manifest metadata (docs/06 §5): menus declare, the shell consumes. Field names are Candidates.
 * Render bindings (icon, page component) are React-bound and live in the kernel's MenuEntry.
 */
export type ContextKey = 'time' | 'roomNames' | 'line' | 'prcGroup' | 'condition' | 'selection' | 'lot' | 'ppid' | 'recipe' | 'metric';
/** apply = direct query filter · reference = carried/visible, not a query filter · unsupported = preserved, not applied */
export type Capability = 'apply' | 'reference' | 'unsupported';
export type PageType = 'overview' | 'analysis' | 'management' | 'catalog' | 'workflow';
export type GroupId = 'overview' | 'myActivity' | 'equipment' | 'masterData' | 'analytics' | 'metrics' | 'noticeVoc' | 'admin' | 'clas' | 'logMyWork' | 'logModels' | 'logCross' | 'logRules' | 'impMyWork' | 'impTasks' | 'impReports';
/** The platform's closed group list at runtime (a module group is `<moduleId>:<name>`, ADR-0053). The Record keeps it complete: a new GroupId member fails typecheck until it is listed here. */
const GROUP_ID_SET: Record<GroupId, true> = { overview: true, myActivity: true, equipment: true, masterData: true, analytics: true, metrics: true, noticeVoc: true, admin: true, clas: true, logMyWork: true, logModels: true, logCross: true, logRules: true, impMyWork: true, impTasks: true, impReports: true };
export const GROUP_IDS: readonly GroupId[] = Object.keys(GROUP_ID_SET) as GroupId[];
/** The space vocabulary at runtime — emitted to `vocab.json` for servers outside this workspace (#674). */
export const SPACE_IDS = ['analytics', 'metrics', 'clas', 'operations', 'log-dev', 'improvement'] as const;
export type SpaceId = typeof SPACE_IDS[number];
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
};
/** The permission vocabulary in canonical order — one runtime list for validators and selects (mock server, console filters). */
export const PERMISSIONS = ['platform:view', 'equipment:view', 'master:view', 'analytics:view', 'metrics:view', 'notice:view', 'voc:view', 'console:access', 'feedbackops:access'] as const;
export type Permission = typeof PERMISSIONS[number];

/** One drill step: a page key plus the name the path bar shows (06 §6.4, ADR-0025). */
export type DrillLevel = { key: string; label: Text };

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
  /** Parent menu for breadcrumb/active-nav on detail routes. */
  parent?: string;
  /** Group's representative destination for the home group cards (08; field name Candidate, 06 §5). Exactly one per group. */
  primary?: boolean;
  /**
   * Ordered in-page drill (06 §6.4, ADR-0025). Each level key must also be a `pageKey` and a `contextResetKey`.
   * One to four levels. `returnTo` is not a level key. Values stay page-owned and are not promoted to global Context.
   */
  drill?: { levels: readonly DrillLevel[] };
};
