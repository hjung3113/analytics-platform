import type { Text } from './i18n';

/**
 * Menu manifest metadata (docs/06 §5): menus declare, the shell consumes. Field names are Candidates.
 * Render bindings (icon, page component) are React-bound and live in the kernel's MenuEntry.
 */
export type ContextKey = 'time' | 'roomNames' | 'condition' | 'selection' | 'lot' | 'ppid' | 'recipe' | 'metric';
/** apply = direct query filter · reference = carried/visible, not a query filter · unsupported = preserved, not applied */
export type Capability = 'apply' | 'reference' | 'unsupported';
export type PageType = 'overview' | 'analysis' | 'management' | 'catalog' | 'workflow';
export type GroupId = 'overview' | 'equipment' | 'masterData' | 'analytics' | 'metrics' | 'noticeVoc' | 'admin';
export type Permission = 'platform:view' | 'equipment:view' | 'master:view' | 'analytics:view' | 'metrics:view' | 'notice:view' | 'voc:view' | 'admin:manage';

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
  /** Id-only metricId is completed from PUBLISHED_METRICS. Every other menu rejects it as metric_pair_incomplete. */
  initializesMetric?: boolean;
  /** Detail/destination routes are reachable through Context Links, not the sidebar. */
  navHidden?: boolean;
  /** Parent menu for breadcrumb/active-nav on detail routes. */
  parent?: string;
  /** Group's representative destination for the home group cards (08 §4; registry field is a Candidate). Exactly one per group. */
  primary?: boolean;
};
