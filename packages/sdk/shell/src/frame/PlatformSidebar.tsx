import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { NavItem } from './AppSidebar';
import { usePlatformMenu } from './platformMenu';
import { MenuUnread } from './unread';
import { PROTO_1189 } from './proto1189';
import { SystemSwitcher } from './SystemSwitcher';

/**
 * Sidebar of the global screens outside any space (home, 내 활동, 공지; 15 §3.2, ADR-0070). Same shell, collapse
 * state and `[` key as the business sidebar; no Scope selector, favorites, recent or feature block.
 */
export function PlatformSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { route } = usePlatform();
  const { t, tx } = useI18n();
  const { sections, labelOf } = usePlatformMenu();
  const activeId = route?.menu.navHidden && route.menu.parent ? route.menu.parent : route?.menu.id;

  return <TooltipProvider delayDuration={200}>
    <aside data-collapsed={collapsed} className={cn('flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar', collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)')}>
      <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
        {!collapsed && (PROTO_1189 === 'C' ? <SystemSwitcher placement="head" /> : <p className="min-w-0 truncate text-sm font-semibold">{t('platformName')}</p>)}
        <Tooltip><TooltipTrigger asChild>
          <button type="button" onClick={onToggle} aria-label={collapsed ? t('expand') : t('collapse')} aria-keyshortcuts="["
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary">
            {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
          </button>
        </TooltipTrigger><TooltipContent side="right">{collapsed ? t('expand') : t('collapse')} ([)</TooltipContent></Tooltip>
      </div>
      <div className="shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <nav aria-label={t('platformMenu')}>
          {sections.map(({ group, items }, index) => {
            const headed = !(group.hideLabelWhenSingle && items.length === 1);
            return <div key={group.id} role="group" aria-label={tx(group.label)}>
              {!collapsed && headed && <p className={cn('mx-2 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted', index === 0 ? 'mt-1.5' : 'mt-3.5')}>{tx(group.label)}</p>}
              {((collapsed && index > 0) || (!collapsed && !headed && index > 0)) && <div className="mx-3 my-1.5 border-t border-border-subtle" aria-hidden />}
              <ul className="space-y-0.5">{items.map(menu => <li key={menu.id}><MenuUnread menuId={menu.id}>{count => <NavItem menu={menu} active={menu.id === activeId} collapsed={collapsed} label={labelOf(menu)} unread={count} />}</MenuUnread></li>)}</ul>
            </div>;
          })}
        </nav>
      </div>
    </aside>
  </TooltipProvider>;
}
