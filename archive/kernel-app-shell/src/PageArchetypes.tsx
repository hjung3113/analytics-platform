/** §12 Canonical Page Archetypes. Each one fills only PlatformPage's `content` slot: Page Header, Global Context and Data Trust are Shell slots (§8/§11) on every page type, so no archetype renders or accepts them. */
import type { ReactNode } from 'react';
import type { MenuEntry } from './registry';
type Region = { label: string; className: string; role?: 'search' };
export type ArchetypeSlots<Name extends string> = { [K in Name]: ReactNode } & { children?: never };
// §25: <1024px stacks (조회 중심), `lg` 1024–1439px reduces grid columns, `wide` ≥1440px is the full layout. No other breakpoint is used.
// An unfilled region keeps its landmark and shows its label via a pseudo-element, so textContent stays empty for fixtures.
const regionBase = 'min-w-0 empty:min-h-16 empty:rounded-sm empty:border empty:border-dashed empty:border-border-subtle empty:p-3 empty:before:text-xs empty:before:text-text-muted empty:before:content-[attr(aria-label)]';
// §25 1024–1439px: the docked secondary panel becomes a right-edge drawer, sticky (top-0) in its normal-flow position inside PlatformPage's content slot — below the Shell header and Global Context (§8/§11), so its rendered top boundary never covers them. `fixed inset-y-0` drew it from the viewport top over both; sticky only pins it once the user scrolls to it, and `max-h-screen` + `overflow-auto` cap its height. `ml-auto` keeps it hugging the right edge; not shown while empty. Open/close and focus trap (§26) belong to the slot content, e.g. DetailDrawer.
const drawerBelowWide = 'lg:max-wide:sticky lg:max-wide:top-0 lg:max-wide:max-h-screen lg:max-wide:ml-auto lg:max-wide:z-10 lg:max-wide:w-[min(420px,95vw)] lg:max-wide:overflow-auto lg:max-wide:border-l lg:max-wide:border-border-subtle lg:max-wide:bg-surface-detail lg:max-wide:p-6 lg:max-wide:shadow-xl lg:max-wide:empty:hidden';
/** Regions render in declaration order, which is the §12 order; layouts place them without reordering reading sequence. */
function defineArchetype<const R extends Record<string, Region>>(archetype: MenuEntry['pageType'], layout: string, regions: R) {
  const names = Object.keys(regions) as (keyof R & string)[];
  const component = `${archetype} archetype`;
  function Archetype(props: ArchetypeSlots<keyof R & string>) {
    const keys = Object.keys(props);
    if (keys.length !== names.length || keys.some(key => !names.includes(key))) throw new Error(`${component} requires exactly ${names.length} named regions: ${names.join(', ')}`);
    return <div data-archetype={archetype} className={`grid gap-4 p-4 ${layout}`}>{names.map(name => <section key={name} data-region={name} role={regions[name].role} aria-label={regions[name].label} className={`${regionBase} ${regions[name].className}`}>{props[name]}</section>)}</div>;
  }
  Archetype.displayName = component;
  return Object.assign(Archetype, { regionNames: names });
}
export const OverviewArchetype = defineArchetype('overview', 'lg:grid-cols-2 wide:grid-cols-3', {
  primarySummary: { label: 'Primary KPI / Summary', className: 'lg:col-span-2 wide:col-span-3' },
  mainTrend: { label: 'Main Trend or Status', className: 'wide:col-span-2' },
  attentionList: { label: 'Attention List', className: '' },
});
export const AnalysisWorkspaceArchetype = defineArchetype('analysis', 'wide:grid-cols-[minmax(0,1fr)_360px]', {
  kpiSummary: { label: 'KPI Summary', className: 'wide:col-span-2' },
  primaryChart: { label: 'Primary Chart', className: '' },
  selectionAnnotation: { label: 'Selection / Annotation', className: drawerBelowWide },
  breakdownTable: { label: 'Breakdown Table', className: 'wide:col-span-2' },
});
export const ManagementArchetype = defineArchetype('management', 'wide:grid-cols-[minmax(0,1fr)_420px]', {
  searchFilter: { label: 'Search + Filter', className: 'wide:col-start-1 wide:row-start-1', role: 'search' },
  dataTable: { label: 'Data Table', className: 'wide:col-start-1 wide:row-start-2' },
  selectionActions: { label: 'Selection Actions', className: 'wide:col-start-1 wide:row-start-3' },
  detailDrawer: { label: 'Detail Drawer', className: `wide:col-start-2 wide:row-span-2 wide:row-start-1 ${drawerBelowWide}` },
  historyAudit: { label: 'History / Audit', className: 'wide:col-start-2 wide:row-start-3' },
});
export const CatalogArchetype = defineArchetype('catalog', 'lg:grid-cols-[280px_minmax(0,1fr)] wide:grid-cols-[320px_repeat(3,minmax(0,1fr))]', {
  catalogList: { label: 'Catalog List', className: 'lg:row-span-6 wide:row-span-4' },
  definitionDetail: { label: 'Definition Detail', className: 'wide:col-span-3' },
  version: { label: 'Version', className: '' },
  ownership: { label: 'Ownership', className: '' },
  coverage: { label: 'Coverage', className: '' },
  usageDependency: { label: 'Usage / Dependency', className: 'wide:col-span-3' },
  history: { label: 'History', className: 'wide:col-span-3' },
});
export const WorkflowArchetype = defineArchetype('workflow', 'lg:grid-cols-[280px_minmax(0,1fr)] wide:grid-cols-[320px_minmax(0,1fr)_320px]', {
  queueList: { label: 'Queue/List', className: 'lg:col-start-1 lg:row-start-1' },
  statusFilter: { label: 'Status/Priority/Owner Filter', className: 'lg:col-start-1 lg:row-span-2 lg:row-start-2', role: 'search' },
  detail: { label: 'Detail', className: 'lg:col-start-2 lg:row-start-1' },
  timeline: { label: 'Timeline', className: 'lg:col-start-2 lg:row-start-2' },
  comments: { label: 'Comments', className: 'lg:col-start-2 lg:row-start-3' },
  relatedContext: { label: 'Related Context', className: 'lg:col-span-2 lg:row-start-4 wide:col-span-1 wide:col-start-3 wide:row-span-3 wide:row-start-1' },
});
