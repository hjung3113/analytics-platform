import { ChevronLeft } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { useHostPlatform } from '@ap/kernel/host';
import { NavItem, SIDEBAR_ID } from './AppSidebar';
import { usePlatformMenu } from './platformMenu';
import { SidebarHierarchy, SIDEBAR_GROUP_TITLE } from './SidebarHierarchy';
import { MenuUnread } from './unread';

/**
 * Sidebar of the global screens outside any space (home, 내 활동, 공지; 15 §3.2, ADR-0070). Same collapse state, rail «홈» toggle
 * and `[` key as the business sidebar (#2727); no Scope selector, favorites, recent or feature block.
 */
export function PlatformSidebar({ onToggle }: { onToggle: () => void }) {
  const { route } = usePlatform();
  const { canOpen } = useHostPlatform();
  const { t, tx } = useI18n();
  const { sections, labelOf } = usePlatformMenu();
  const hasHierarchy = sections.some(({ items }) => items.some(menu => menu.navTree && canOpen(menu.id)));
  const activeId = route?.menu.navHidden && route.menu.parent ? route.menu.parent : route?.menu.id;

  return <TooltipProvider delayDuration={200}>
    <aside id={SIDEBAR_ID} className="flex h-full w-(--sidebar-width) shrink-0 flex-col border-r border-border-chrome bg-surface-sidebar">
      <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
        <p className="min-w-0 truncate text-sm font-semibold">{t('platformName')}</p>
        <Tooltip><TooltipTrigger asChild>
          <button type="button" onClick={onToggle} aria-label={t('collapse')} aria-keyshortcuts="["
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        </TooltipTrigger><TooltipContent side="right">{t('collapse')} ([)</TooltipContent></Tooltip>
      </div>
      <div data-sidebar-scroll className={hasHierarchy ? 'shell-scroll min-h-0 flex-1 overflow-hidden px-2 py-2' : 'shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2'}>
        <nav id="platform-nav" aria-label={t('platformMenu')}>
          {sections.map(({ group, items }, index) => {
            const headed = !(group.hideLabelWhenSingle && items.length === 1);
            return <div key={group.id} role="group" aria-label={tx(group.label)}>
              {headed && <p className={cn(SIDEBAR_GROUP_TITLE, index === 0 ? 'mt-1.5' : 'mt-3.5')}>{tx(group.label)}</p>}
              {!headed && index > 0 && <div className="mx-3 my-1.5 border-t border-border-subtle" aria-hidden />}
              <ul className="space-y-0.5">{items.map(menu => <li key={menu.id}><MenuUnread menuId={menu.id}>{count => <NavItem menu={menu} active={menu.id === activeId} label={labelOf(menu)} unread={count} />}</MenuUnread></li>)}</ul>
              {items.filter(menu => menu.navTree && canOpen(menu.id)).map(menu => <SidebarHierarchy key={menu.id} menu={menu} />)}
            </div>;
          })}
        </nav>
      </div>
    </aside>
  </TooltipProvider>;
}
