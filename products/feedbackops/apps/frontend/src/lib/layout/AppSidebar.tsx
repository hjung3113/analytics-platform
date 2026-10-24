import type { SavedViewSurface } from '@/lib/api/saved-views';
import { ROUTER_FALLBACK_COPY } from '@/lib/copy/router';
import { InternalLink } from '@/lib/router/InternalLink';
import { ManagedSystemScopePicker } from '@/operator-screens/scope-picker/ManagedSystemScopePicker';
import type { ManagedSystemScopeOption } from '@/operator-screens/scope-picker/ManagedSystemScopePicker';
import { cn } from '@fops/ui';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

export type NavCounts = Partial<Record<NavCountKey, number>>;
export type NavCountKey =
  | 'voc.inbox'
  | 'voc.triage'
  | 'voc.my'
  | 'voc.tab.high'
  | 'voc.tab.unassigned'
  | 'voc.tab.untriaged'
  | 'voc.tab.waiting'
  | 'voc.inbox.no-link'
  | 'voc.clusters'
  | 'findings.all'
  | 'surveys.all'
  | 'home.unassigned-voc'
  | 'home.high-severity-unlinked'
  | 'home.actionable-finding-no-execution'
  | 'home.released-task-unresolved-voc'
  | 'home.bad-outcome-no-followup'
  | 'home.permission-requests-pending';

export interface SidebarNavEntry {
  id: string;
  label: string;
  href: string;
  section?: string;
  icon?: React.ReactNode;
  parentId?: string;
  active?: boolean;
  contextActive?: boolean;
  countKey?: NavCountKey;
  /** Explicit, route-owned count. Undefined is deliberately not rendered. */
  count?: number;
  disabled?: boolean;
  trailing?: React.ReactNode;
}

/**
 * Sidebar row that runs an action instead of navigating (#611: the Home
 * Command row opens the palette — an action, not a route). No href, no count.
 */
export interface SidebarNavActionEntry {
  id: string;
  label: string;
  section?: string;
  icon?: React.ReactNode;
  active?: boolean;
  trailing?: React.ReactNode;
  onSelect: () => void;
}

export type SidebarNavItem = SidebarNavEntry | SidebarNavActionEntry;

export type { ManagedSystemScopeOption };

export interface AppSidebarProps {
  entries: SidebarNavItem[];
  systemLabel?: string;
  systemSubtitle?: string;
  className?: string;
  defaultCollapsed?: boolean;
  counts?: NavCounts;
  managedSystems?: ManagedSystemScopeOption[];
  selectedManagedSystemId?: string;
  /** False on a route whose data is not scoped by Managed System (e.g. most of Admin). */
  scopeControlEnabled?: boolean;
  isAdmin?: boolean;
  /** Whether the actor's current scope is workspace-wide, rather than a granted union. */
  workspaceWideScope?: boolean;
  onManagedSystemChange?: (managedSystemId: string | undefined) => void;
  savedViews?: Array<{ id: string; name: string }>;
  /**
   * Surface of the passed `savedViews` (#972 FIX1). A change means the sidebar
   * now shows another surface's list, so any pending delete focus recovery is
   * dropped instead of firing into the new surface's section.
   */
  savedViewSurface?: SavedViewSurface;
  canSaveView?: boolean;
  onSaveView?: (name: string) => void;
  onApplySavedView?: (id: string) => void;
  onDeleteSavedView?: (id: string) => undefined | Promise<unknown>;
  /** Already allowlisted by the caller (ADR-0071); rendered as a same-tab external link. */
  platformReturnUrl?: string;
}

const STORAGE_KEY = 'appSidebarCollapsed';

function readInitialCollapsed(defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? defaultValue : stored === '1';
  } catch {
    return defaultValue;
  }
}

export function AppSidebar({
  entries,
  systemLabel = 'VOC',
  systemSubtitle = '고객 피드백',
  className,
  defaultCollapsed = false,
  counts = {},
  managedSystems = [],
  selectedManagedSystemId,
  scopeControlEnabled = true,
  isAdmin = true,
  workspaceWideScope = isAdmin,
  onManagedSystemChange,
  savedViews = [],
  savedViewSurface,
  canSaveView = false,
  onSaveView,
  onApplySavedView,
  onDeleteSavedView,
  platformReturnUrl,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = React.useState(() => readInitialCollapsed(defaultCollapsed));
  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border-subtle bg-surface-sidebar',
        collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)',
        className,
      )}
      aria-label="주요 탐색"
      data-testid="app-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="flex h-(--topbar-height) items-center justify-between border-b border-border-subtle px-3">
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-primary" data-testid="sidebar-system-label">{systemLabel}</div>
            <div className="truncate text-caption text-text-muted" data-testid="sidebar-system-subtitle">{systemSubtitle}</div>
          </div>
        )}
        <button type="button" onClick={toggle} className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text-primary" aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'} data-testid="sidebar-collapse-toggle">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <ManagedSystemScopePicker
        managedSystems={managedSystems}
        {...(selectedManagedSystemId !== undefined ? { value: selectedManagedSystemId } : {})}
        onChange={(managedSystemId) => onManagedSystemChange?.(managedSystemId)}
        disabled={!scopeControlEnabled}
        isAdmin={isAdmin}
        workspaceWideScope={workspaceWideScope}
        collapsed={collapsed}
      />
      {platformReturnUrl !== undefined && (
        <div className="border-b border-border-subtle p-2">
          <a
            href={platformReturnUrl}
            className={navItemClass(collapsed)}
            data-testid="platform-return-link"
            title={collapsed ? ROUTER_FALLBACK_COPY.platformReturn : undefined}
            aria-label={collapsed ? ROUTER_FALLBACK_COPY.platformReturn : undefined}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate">{ROUTER_FALLBACK_COPY.platformReturn}</span>
            )}
          </a>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-0.5">
          {entries.map((entry, index) => {
            const showSection = !collapsed && entry.section !== undefined && entry.section !== entries[index - 1]?.section;
            const count = 'onSelect' in entry ? undefined : (entry.count ?? (entry.countKey === undefined ? undefined : counts[entry.countKey]));
            return <React.Fragment key={entry.id}>
              {showSection && entry.section !== undefined && <div className={cn('mx-2 mb-1 text-caption font-semibold uppercase tracking-wide text-text-disabled', index === 0 ? 'mt-1.5' : 'mt-3.5')} data-testid={`sidebar-section-${sectionTestId(entry.section)}`}>{entry.section}</div>}
              {'onSelect' in entry ? (
                <button type="button" onClick={entry.onSelect} className={navItemClass(collapsed, entry.active)} data-testid={`sidebar-nav-${entry.id}`} title={collapsed ? entry.label : undefined} aria-label={collapsed ? entry.label : undefined} aria-haspopup="dialog">
                  {entry.icon && <span className="shrink-0">{entry.icon}</span>}
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{entry.label}</span>}
                  {!collapsed && entry.trailing}
                </button>
              ) : entry.disabled ? (
                <button type="button" disabled className={cn(navItemClass(collapsed, entry.active, entry.contextActive), 'cursor-not-allowed opacity-60')} data-testid={`sidebar-nav-${entry.id}`} title={collapsed ? entry.label : undefined} aria-label={collapsed ? entry.label : undefined}>
                  {entry.icon && <span className="shrink-0">{entry.icon}</span>}
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{entry.label}</span>}
                  {!collapsed && entry.trailing}
                </button>
              ) : (
                <InternalLink
                  href={scopedHref(entry.href, selectedManagedSystemId)}
                  className={navItemClass(collapsed, entry.active, entry.contextActive)}
                  data-testid={`sidebar-nav-${entry.id}`}
                  aria-current={entry.active ? 'page' : undefined}
                  title={collapsed ? entry.label : undefined}
                  aria-label={collapsed ? entry.label : undefined}
                >
                  {entry.icon && <span className="shrink-0">{entry.icon}</span>}
                  {!collapsed && <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}</span>}
                  {!collapsed && count !== undefined && <NavCountBadge entryId={entry.id} count={count} />}
                  {!collapsed && entry.trailing}
                </InternalLink>
              )}
            </React.Fragment>;
          })}
          {!collapsed && (savedViews.length > 0 || canSaveView) && (
            <SavedViewsSection
              views={savedViews}
              surface={savedViewSurface}
              canSave={canSaveView}
              {...(onSaveView !== undefined ? { onSave: onSaveView } : {})}
              {...(onApplySavedView !== undefined ? { onApply: onApplySavedView } : {})}
              {...(onDeleteSavedView !== undefined ? { onDelete: onDeleteSavedView } : {})}
            />
          )}
        </div>
      </nav>
    </aside>
  );
}

function SavedViewsSection({
  views,
  surface,
  canSave,
  onSave,
  onApply,
  onDelete,
}: {
  views: Array<{ id: string; name: string }>;
  surface: SavedViewSurface | undefined;
  canSave: boolean;
  onSave?: (name: string) => void;
  onApply?: (id: string) => void;
  onDelete?: (id: string) => undefined | Promise<unknown>;
}) {
  const [name, setName] = React.useState('');
  // #972 FIX1: a delete arms focus recovery only once its promise fulfils — a
  // rejected delete keeps focus on its × and row, and never moves focus later.
  // Each armed delete remembers the view order captured at click time; when
  // the deleted row leaves the list, the target is chosen from the survivors
  // at that moment, skipping views that are themselves awaiting their own
  // delete refetch. If no neighbour row and no save input exists, focus stays
  // where the browser leaves it.
  const [pendingRecovery, setPendingRecovery] = React.useState(
    () => new Map<string, { order: string[]; deletedIndex: number }>(),
  );
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const surfaceGeneration = React.useRef(0);
  const committedSurface = React.useRef(surface);

  React.useEffect(() => {
    if (surface !== committedSurface.current) {
      committedSurface.current = surface;
      surfaceGeneration.current += 1;
    }
  }, [surface]);

  // A surface change means the section now shows another surface's list; any
  // recovery armed for the previous surface must not fire into it. Reset in
  // the render phase so the effect below sees the cleared map in the same pass.
  const [prevSurface, setPrevSurface] = React.useState(surface);
  if (surface !== prevSurface) {
    setPrevSurface(surface);
    if (pendingRecovery.size > 0) setPendingRecovery(() => new Map());
  }

  React.useEffect(() => {
    if (pendingRecovery.size === 0) return;
    const survivors = new Set(views.map((view) => view.id));
    const inFlight = new Set(pendingRecovery.keys());
    const section = sectionRef.current;
    let next: typeof pendingRecovery | null = null;
    let rowTarget: HTMLElement | null = null;
    let allowSaveInputFallback = false;
    for (const [deletedId, capture] of pendingRecovery) {
      if (survivors.has(deletedId)) continue; // refetch has not landed yet
      inFlight.delete(deletedId);
      next ??= new Map(pendingRecovery);
      next.delete(deletedId);
      if (rowTarget !== null) continue; // one focus move per pass
      const pick = (ids: string[]) => ids.find((id) => survivors.has(id) && !inFlight.has(id));
      const targetId =
        pick(capture.order.slice(capture.deletedIndex + 1)) ??
        pick([...capture.order.slice(0, capture.deletedIndex)].reverse()) ??
        null;
      if (targetId !== null) {
        rowTarget = section?.querySelector<HTMLElement>(`[data-testid="saved-view-apply-${targetId}"]`) ?? null;
      }
      if (rowTarget === null) allowSaveInputFallback = true;
    }
    let target = rowTarget;
    if (target === null && allowSaveInputFallback && canSave) {
      target = section?.querySelector<HTMLElement>('input[aria-label="저장된 보기 이름"]') ?? null;
    }
    if (next !== null) setPendingRecovery(next);
    // #972 FIX2: move focus only when the user has not put focus elsewhere —
    // an activeElement outside this section (main content, other UI) keeps it.
    const active = document.activeElement;
    const focusIsFree =
      active === null || active === document.body || (section?.contains(active) ?? false);
    if (target !== null && focusIsFree) target.focus();
  }, [pendingRecovery, views, canSave]);

  const requestDelete = (id: string) => {
    const generation = surfaceGeneration.current;
    const order = views.map((view) => view.id);
    const capture = { order, deletedIndex: order.indexOf(id) };
    Promise.resolve(onDelete?.(id)).then(
      () => {
        if (surfaceGeneration.current !== generation) return;
        setPendingRecovery((prev) => {
          if (prev.has(id)) return prev;
          const next = new Map(prev);
          next.set(id, capture);
          return next;
        });
      },
      () => {
        // Rejected delete: the row stays and no recovery is armed.
      },
    );
  };

  return (
    <section
      ref={sectionRef}
      className="mt-3.5"
      aria-label="저장된 보기"
      data-testid="saved-views-section"
    >
      <div className="mx-2 mb-1 text-caption font-semibold uppercase tracking-wide text-text-disabled">저장된 보기</div>
      {views.map((view) => (
        <div key={view.id} className="group flex items-center gap-1">
          <button type="button" className="min-w-0 flex-1 rounded-md px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary" onClick={() => onApply?.(view.id)} title={view.name} data-testid={`saved-view-apply-${view.id}`}>
            <span className="block truncate">{view.name}</span>
          </button>
          <button type="button" className="mr-1 rounded p-1 text-text-muted opacity-0 hover:text-accent-danger group-hover:opacity-100 focus:opacity-100" aria-label={`저장된 보기 ${view.name} 삭제`} onClick={() => requestDelete(view.id)} data-testid={`saved-view-delete-${view.id}`}>×</button>
        </div>
      ))}
      {canSave && (
        <form className="mt-1 flex gap-1 px-2" onSubmit={(event) => { event.preventDefault(); const trimmed = name.trim(); if (trimmed) { onSave?.(trimmed); setName(''); } }}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required aria-label="저장된 보기 이름" placeholder="현재 필터 저장" className="min-w-0 flex-1 rounded border border-border-subtle bg-surface-canvas px-2 py-1 text-xs" />
          <button type="submit" className="rounded px-2 py-1 text-xs text-accent-primary hover:bg-surface-row-hover" data-testid="saved-view-save">저장</button>
        </form>
      )}
    </section>
  );
}

function NavCountBadge({ entryId, count }: { entryId: string; count: number }) {
  return <span className="rounded-full bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold tabular-nums text-text-secondary" data-testid={`sidebar-count-${entryId}`}>{count}</span>;
}

function navItemClass(collapsed: boolean, active = false, contextActive = false) { return cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0', active && 'bg-surface-row-selected text-text-primary', contextActive && !active && 'font-medium text-text-primary'); }
const KOREAN_SECTION_TEST_IDS: Record<string, string> = {
  Finding: 'findings',
  Task: 'tasks',
  Survey: 'surveys',
  '액션 큐': 'action-queues',
  연동: 'integration',
  관리자: 'admin',
};
function sectionTestId(section: string) {
  // Test ids stay Latin even when the visible section header is Korean.
  return KOREAN_SECTION_TEST_IDS[section] ?? section.toLowerCase().replace(/\s+/g, '-');
}
function scopedHref(href: string, managedSystemId: string | undefined) {
  if (managedSystemId === undefined || !href.startsWith('/vocs')) return href;
  const url = new URL(href, 'http://feedbackops.local');
  url.searchParams.set('managedSystem', managedSystemId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
