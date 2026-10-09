// THROWAWAY #250 — never merge.
import type { Text } from './i18n';

/**
 * Menu manifest metadata (docs/06 §5): menus declare, the shell consumes. Field names are Candidates.
 * Render bindings (icon, page component) are React-bound and live in the kernel's MenuEntry.
 */
export type ContextKey = 'time' | 'roomNames' | 'condition' | 'selection' | 'lot' | 'ppid' | 'recipe' | 'metric';
/** apply = direct query filter · reference = carried/visible, not a query filter · unsupported = preserved, not applied */
export type Capability = 'apply' | 'reference' | 'unsupported';
export type PageType = 'overview' | 'analysis' | 'management' | 'catalog' | 'workflow';
export type GroupId = 'overview' | 'equipment' | 'masterData' | 'analytics' | 'metrics' | 'noticeVoc' | 'admin' | 'logdevStatus' | 'logdevModels' | 'logdevValidation' | 'logdevPartner' | 'improveTasks' | 'improveField' | 'myVoc';
/** Prototype registries use the workspace ids. `analytics` and `feedback` stay so existing fixtures still typecheck. */
export type SpaceId = 'productivity' | 'metrics' | 'logdev' | 'improvement' | 'operations' | 'common' | 'analytics' | 'feedback';
/** Sidebar-visible group set + entry permission (06 §9.1). Groups declare membership via GroupDef.space, menus never do. */
export type SpaceDef = {
  id: SpaceId;
  label: Text;
  /** Entry permission; absent means every signed-in user (analytics). */
  permission?: Permission;
  /** Landing menu inside this space whose path has no `:param`. */
  homeMenuId: string;
};
/** The permission vocabulary in canonical order — one runtime list for validators and selects (mock server, console filters). */
export const PERMISSIONS = ['platform:view', 'equipment:view', 'master:view', 'analytics:view', 'metrics:view', 'notice:view', 'voc:view', 'console:access', 'logdev:view', 'improve:view', 'collab:hub'] as const;
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
  pageType: PageType;
  features: { export: boolean; savedView: boolean; annotate: boolean; compare: boolean };
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
  /** THROWAWAY #250. The shell shows this menu as the first row of a workspace collaboration tab. */
  protoSlot?: 'my-voc';
  /**
   * Ordered in-page drill (06 §6.4, ADR-0025). Each level key must also be a `pageKey` and a `contextResetKey`.
   * One to four levels. `returnTo` is not a level key. Values stay page-owned and are not promoted to global Context.
   */
  drill?: { levels: readonly DrillLevel[] };
};
