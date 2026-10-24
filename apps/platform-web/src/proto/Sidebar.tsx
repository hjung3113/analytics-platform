// THROWAWAY #595 — never merge.
// FeedbackOps sidebar (replaces AppSidebar inside the FeedbackOps space) and the bottom block other systems draw (replaces the new-tab block).
import { Activity, ChevronLeft, ChevronRight, ClipboardList, Clock3, Database, FileBarChart, Flag, House, Inbox, Layers, Link2, ListChecks, ListTodo, MessagesSquare, Settings, Shield, ShieldCheck, Star, User, type LucideIcon } from 'lucide-react';
import { PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { cn } from '@ap/ui';
import { ScopeDropdown } from './Scope';
import { PROTO, setEntry } from './state';
import { feedbackOpsManaged } from './mock';

type Item = { menu: string; label: string; icon: LucideIcon; count?: number; tab?: string; saved?: boolean };
type Block = { heading: string; items: Item[]; onlyA?: boolean };

const NAV: Record<string, Block[]> = {
  foDash: [{ heading: '대시보드', items: [{ menu: 'fo-dashboard', label: '대시보드', icon: House }] }],
  foVoc: [
    { heading: 'VOC', items: [
      { menu: 'fo-voc-inbox', label: '수신함', icon: MessagesSquare, count: 48 }, { menu: 'fo-voc-triage', label: 'Triage', icon: Flag, count: 17 },
      { menu: 'fo-voc-clusters', label: 'Clusters', icon: Layers, count: 6 }] },
    { heading: 'Triage 보기', items: [
      { menu: 'fo-voc-triage', label: '높음', icon: Flag, count: 5, tab: 'high' }, { menu: 'fo-voc-triage', label: '미배정', icon: User, count: 9, tab: 'unassigned' }] },
    { heading: '보기', items: [{ menu: 'fo-voc-inbox', label: '연결 없음', icon: Link2, count: 12, tab: 'no-link' }] },
    { heading: '저장된 보기', onlyA: true, items: [
      { menu: 'fo-voc-inbox', label: '내가 맡은 높음 VOC', icon: Star, tab: 'saved-1', saved: true }, { menu: 'fo-voc-inbox', label: '2주 넘은 미해결', icon: Star, tab: 'saved-2', saved: true }] },
  ],
  foFindings: [{ heading: 'Finding', items: [{ menu: 'fo-findings', label: '전체 Finding', icon: ListChecks, count: 23 }] }],
  foTasks: [{ heading: 'Task', items: [
    { menu: 'fo-task-requests', label: 'Task Requests', icon: Inbox }, { menu: 'fo-tasks', label: 'Tasks', icon: ListTodo }, { menu: 'fo-my-tasks', label: '내 Task', icon: User }, { menu: 'fo-milestones', label: 'Milestones', icon: Flag }] }],
  foIntegration: [{ heading: '연동', items: [
    { menu: 'fo-int-dashboard', label: '액션 대시보드', icon: Activity }, { menu: 'fo-int-findings', label: 'Findings', icon: ListChecks, count: 23 }, { menu: 'fo-int-evidence', label: 'Evidence', icon: FileBarChart },
    { menu: 'fo-int-links', label: '엔티티 링크', icon: Link2 }, { menu: 'fo-int-coverage', label: '커버리지', icon: Layers }] }],
  foSurveys: [{ heading: 'Survey', items: [{ menu: 'fo-survey-manage', label: 'Survey 관리', icon: FileBarChart, count: 4 }] }],
  foAdmin: [{ heading: '관리자', items: [
    { menu: 'fo-admin-ms', label: 'Managed System', icon: Database }, { menu: 'fo-admin-aa', label: 'Analytics Area', icon: Layers }, { menu: 'fo-admin-permissions', label: '권한 요청', icon: Shield },
    { menu: 'fo-admin-grants', label: '활성 권한', icon: ShieldCheck }, { menu: 'fo-admin-settings', label: '워크스페이스 설정', icon: Settings }] }],
};

const ITEM = 'relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary';

export function ProtoSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { route, linkTo, registry, pageParam, favorites, recent, canOpen } = usePlatform();
  const { t } = useI18n();
  const favoriteMenus = favorites.filter(id => canOpen(id)).map(id => registry.menuById(id));
  const recentItems = recent.filter(r => canOpen(r.menuId)).slice(0, 5);
  const group = route === null ? null : route.menu.group;
  const blocks = (group === null ? [] : NAV[group] ?? []).filter(b => !b.onlyA || PROTO.variant === 'A');
  const sectionName = group === null ? '' : registry.groupById(group).label.ko;
  const tab = pageParam('tab');
  return <aside data-collapsed={collapsed} className={cn('flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar', collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)')}>
    <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
      {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">FeedbackOps</p><p className="truncate text-caption text-text-muted">{sectionName}</p></div>}
      <button type="button" onClick={onToggle} aria-label={collapsed ? '펼치기' : '접기'} className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary">
        {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
      </button>
    </div>
    {PROTO.variant === 'A' && <ScopeDropdown layout="sidebar" collapsed={collapsed} />}
    <div className="shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <nav aria-label="FeedbackOps 메뉴">
        {blocks.map((block, index) => <div key={block.heading} role="group" aria-label={block.heading}>
          {!collapsed && (blocks.length > 1 || block.heading !== sectionName) && <p className={cn('mx-2 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted', index === 0 ? 'mt-1.5' : 'mt-3.5')}>{block.heading}</p>}
          {collapsed && index > 0 && <div className="mx-3 my-1.5 border-t border-border-subtle" aria-hidden />}
          <ul className="space-y-0.5">{block.items.map(item => {
            const active = route?.menu.id === item.menu && (item.tab ?? null) === tab;
            const Icon = item.icon;
            return <li key={`${item.menu}${item.tab ?? ''}`}>
              <PlatformLink via="sidebar" href={item.tab ? linkTo(item.menu, { page: { tab: item.tab } }) : linkTo(item.menu)} aria-current={active ? 'page' : undefined} title={item.label}
                className={cn(ITEM, collapsed && 'justify-center px-0', active && 'bg-surface-row-selected font-semibold text-text-primary')}>
                {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
                <Icon className="size-4 shrink-0" aria-hidden />
                {!collapsed && <><span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.count !== undefined && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{item.count}</span>}</>}
              </PlatformLink>
            </li>;
          })}</ul>
        </div>)}
      </nav>
      {!collapsed && <section aria-label={t('favorites')}>
        <p className="mx-2 mb-1 mt-3.5 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-muted"><Star className="size-3" aria-hidden />{t('favorites')}</p>
        {favoriteMenus.length > 0
          ? <ul className="space-y-0.5">{favoriteMenus.map(menu => { const Icon = menu.icon; return <li key={menu.id}><PlatformLink via="sidebar" href={linkTo(menu.id)} className={ITEM}><Icon className="size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{menu.label.ko}</span></PlatformLink></li>; })}</ul>
          : <p className="px-3 py-1 text-xs leading-4 text-text-muted">{t('noFavorites')}</p>}
      </section>}
      {!collapsed && <section aria-label={t('recent')}>
        <p className="mx-2 mb-1 mt-3.5 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-muted"><Clock3 className="size-3" aria-hidden />{t('recent')}</p>
        {recentItems.length > 0
          ? <ul className="space-y-0.5">{recentItems.map(r => { const menu = registry.menuById(r.menuId); const Icon = menu.icon; return <li key={r.menuId}><PlatformLink via="sidebar" href={r.url} className={ITEM}><Icon className="size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{menu.label.ko}</span></PlatformLink></li>; })}</ul>
          : <p className="px-3 py-1 text-xs leading-4 text-text-muted">{t('noRecent')}</p>}
      </section>}
    </div>
  </aside>;
}

const BLOCK_ITEMS: { key: string; label: string; menu: string; icon: LucideIcon }[] = [
  { key: 'voc', label: 'VOC', menu: 'fo-voc-inbox', icon: MessagesSquare },
  { key: 'task', label: 'Task', menu: 'fo-tasks', icon: ListTodo },
  { key: 'survey', label: '설문', menu: 'fo-survey-manage', icon: ClipboardList },
];

/** Bottom block of MARS and the other systems: same three entries, but they open inside the shell with the system preselected. */
export function ProtoBlock({ collapsed }: { collapsed: boolean }) {
  const { route, registry, linkTo, url } = usePlatform();
  const space = route === null ? null : registry.spaceOf(route.menu);
  if (space === null || route === null || !feedbackOpsManaged(space.id)) return null;
  const system = space.label.ko;
  const heading = `FeedbackOps · ${system}`;
  return <nav aria-label={heading} className="shrink-0 border-t border-border-subtle px-2 py-2">
    {!collapsed && <p className="mx-2 mb-1 text-caption font-semibold text-text-muted">{heading}</p>}
    <ul className="space-y-0.5">{BLOCK_ITEMS.map(item => {
      const Icon = item.icon;
      return <li key={item.key}>
        <PlatformLink via="sidebar" href={linkTo(item.menu)} title={`${item.label} — ${system}, FeedbackOps`}
          onClick={() => setEntry({ ms: system, back: { url, label: route.menu.label.ko, system } })}
          className={cn('flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0')}>
          <Icon className="size-4 shrink-0" aria-hidden />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        </PlatformLink>
      </li>;
    })}</ul>
  </nav>;
}
