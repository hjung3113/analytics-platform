import { useMessages, type MenuEntry, type PageProps, PlatformLink, useI18n, useMenuQuery, usePlatform, useRecentVisits } from '@ap/kernel';
import { HOME_MESSAGES } from '../messages';
import { useLayoutEffect, useRef, useState } from 'react';
import { Clock3, Megaphone, Star, X } from 'lucide-react';
import { groupHomeSpaces, type HomeLauncherGroup, type HomeLauncherSpaceNames } from '../launcher-groups';
import { noticesEndpoint } from '../endpoints';
import { dismissNotice, useDismissedNotices } from './dismissed-notices';
import { Panel, PlatformPage, QueryView } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { isAnswered } from '@ap/contracts';

/** Platform home (ADR-0028, 15 §3.1): `내 할 일` (a Kernel slot) beside recent visits, then favorites, system rows and notices. */
const NO_LAUNCHER_GROUPS: readonly HomeLauncherGroup[] = [];
const NO_SPACE_NAMES: HomeLauncherSpaceNames = {};

export default function OperationsHome({ launcherGroups = NO_LAUNCHER_GROUPS, spaceNames = NO_SPACE_NAMES }: Partial<PageProps> & { launcherGroups?: readonly HomeLauncherGroup[]; spaceNames?: HomeLauncherSpaceNames } = {}) {
  const m = useMessages(HOME_MESSAGES);
  const { favorites, toggleFavorite, linkTo, global, registry, accessibleSpaces, canOpen, resolveLink, spaceEntry, homeTodo } = usePlatform();
  const recent = useRecentVisits();
  const { t, tx } = useI18n();

  const dismissed = useDismissedNotices();
  const noFavoritesRef = useRef<HTMLParagraphElement>(null);
  const notices = useMenuQuery(noticesEndpoint, { targetScopeId: global.scopeId });
  const voc = resolveLink('voc');
  const noticesLink = resolveLink('notices');
  const permissionRequests = resolveLink('permission-requests');
  const homeId = registry.platformHome?.id;
  // The operations console is one row for F-only, C-only and both holders: its description names the sections this viewer can open (#1099c), never the ones another grant would add.
  const consoleSections = (spaceKey: string) => registry.groups
    .filter(group => group.space === spaceKey && registry.menus.some(menu => menu.group === group.id && !menu.navHidden && canOpen(menu.id)))
    .map(group => tx(group.label));

  const favoriteMenus = favorites.map(id => registry.menus.find(menu => menu.id === id)).filter((menu): menu is MenuEntry => !!menu && canOpen(menu.id));
  const recentRows = recent.filter(row => row.menuId !== homeId).map(row => {
    const menu = registry.menus.find(item => item.id === row.menuId);
    return menu && canOpen(menu.id) ? { ...row, menu } : null;
  }).filter((row): row is { menuId: string; url: string; at: number; menu: MenuEntry } => row !== null).slice(0, 5);
  const ago = (at: number) => {
    const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
    return mins < 1 ? m('operationsHomeJustNow') : mins < 60 ? m('operationsHomeMAgo', { mins }) : m('operationsHomeHAgo', { mins60: Math.round(mins / 60) });
  };
  const affiliation = (menu: MenuEntry) => {
    const space = registry.spaceOf(menu);
    return space ? tx(space.label) : m('operationsHomePlatform');
  };

  // 06 §26 (#398): the row's remove button disappears with the row it removes. Only from that
  // button's own click, while focus is still on it, focus goes to the next row's remove button,
  // else the previous row's, else the empty-state paragraph. The header star removes rows without
  // disappearing itself, so a list-level effect would steal focus from it — no effect.
  function removeFavoriteRow(menuId: string, button: HTMLButtonElement) {
    const row = button.closest('li');
    const neighbor = row?.nextElementSibling ?? row?.previousElementSibling ?? null;
    const target = neighbor?.querySelector<HTMLButtonElement>('button') ?? null;
    const hadFocus = document.activeElement === button;
    toggleFavorite(menuId);
    if (!hadFocus) return;
    if (target) target.focus();
    else requestAnimationFrame(() => { // the empty state mounts after the state update
      const active = document.activeElement;
      // Focus is still where the click left it (the removed button, or BODY after it unmounted); otherwise the user moved it.
      if (active && active !== document.body && active !== button) return;
      noFavoritesRef.current?.focus();
    });
  }

  const launcherSections = groupHomeSpaces(launcherGroups, accessibleSpaces);
  const todoRef = useRef<HTMLDivElement>(null);
  const [hasTodoContent, setHasTodoContent] = useState(false);

  // Collapse an empty/null-rendering homeTodo slot so Recent visits fills the first row (and vice versa).
  useLayoutEffect(() => {
    const el = todoRef.current;
    if (!homeTodo || !el) {
      setHasTodoContent(false);
      return;
    }
    const sync = () => {
      const next = el.children.length > 0 || (el.textContent?.trim().length ?? 0) > 0;
      setHasTodoContent(prev => (prev === next ? prev : next));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      setHasTodoContent(false);
    };
  }, [homeTodo]);

  const showTodo = !!homeTodo && hasTodoContent;
  // 최근 방문 always shows (its empty message when there are none): the assignment card is width-capped by its owner, so dropping
  // this panel would leave the rest of the first row blank.
  const showRecent = true;
  const twoFirstRowColumns = showTodo && showRecent;

  const compactEntry = (space: typeof accessibleSpaces[number]) => {
    const entry = spaceEntry(space.id);
    if (!entry) return null;
    const resumeMenu = entry.resumed ? registry.menus.find(menu => menu.id === entry.menuId) : undefined;
    const name = tx(spaceNames[space.id] ?? space.label);
    const subtitle = space.subtitle ? tx(space.subtitle) : undefined;
    const srSubtitle = subtitle && subtitle !== name ? subtitle : undefined;
    const description = space.id === 'operations' ? consoleSections(space.id).join(' · ') : tx(space.description);
    return <li key={space.id}>
      <PlatformLink href={entry.href} className="flex min-w-0 items-baseline gap-3 px-3 py-2 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <span className="shrink-0 t-card-title">{name}</span>
        {srSubtitle && <span className="sr-only">{srSubtitle}</span>}
        <span aria-hidden className="text-text-muted">·</span>
        <span className="min-w-0 truncate text-xs text-text-secondary">{description}</span>
        {resumeMenu && <span className="shrink-0 text-xs text-text-secondary">{m('operationsHomeContinue', { label: tx(resumeMenu.label) })}</span>}
      </PlatformLink>
    </li>;
  };

  return <PlatformPage secondaryActions={voc.allowed ? <PlatformLink href={voc.href} className="text-xs font-medium text-accent-primary hover:underline">{m('operationsHomeVOC')}</PlatformLink> : undefined}>
    {/* The first row follows body width, including when a detail slot narrows it. */}
    <div className="@container space-y-4">
      <div className={twoFirstRowColumns ? 'grid items-start gap-3 @xl:grid-cols-2' : 'grid items-start gap-3'}>
        {homeTodo && <div ref={todoRef} className={showTodo ? 'min-w-0 space-y-3 empty:hidden' : 'hidden empty:hidden'}><homeTodo.Todo /></div>}
        {showRecent && <Panel title={<span className="inline-flex items-center gap-2"><Clock3 className="size-4 text-text-muted" aria-hidden />{t('recent')}</span>} subtitle={m('operationsHomeReturnsWithTheFiltersYouUsedAccess')}>
          {recentRows.length === 0 ? <p className="rounded-md bg-surface-sunken p-3 text-xs text-text-secondary">{t('noRecent')}</p> :
            <ul className="divide-y divide-border-subtle">{recentRows.map(row => <li key={row.menuId} className="flex items-center gap-3 py-2">
              <row.menu.icon className="size-4 text-text-muted" aria-hidden />
              <PlatformLink href={row.url} className="min-w-0 flex-1 text-sm font-medium hover:text-accent-primary hover:underline">{tx(row.menu.label)}</PlatformLink>
              <span className="text-tiny text-text-muted">{affiliation(row.menu)}</span>
              <StatusBadge tone="neutral">{ago(row.at)}</StatusBadge>
            </li>)}</ul>}
        </Panel>}
      </div>

      <Panel title={<span className="inline-flex items-center gap-2"><Star className="size-4 text-accent-warn" aria-hidden />{t('favorites')}</span>} subtitle={m('operationsHomeOpensTheScreenSDefaultViewWithYour')}>
        {favoriteMenus.length === 0 ? <p ref={noFavoritesRef} tabIndex={-1}
          className="text-xs text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">{t('noFavorites')}</p> :
          <ul className="divide-y divide-border-subtle">{favoriteMenus.map(menu => <li key={menu.id} className="flex items-center gap-3 py-2">
            <menu.icon className="size-4 text-text-muted" aria-hidden />
            <PlatformLink href={linkTo(menu.id, { page: Object.fromEntries((registry.carrySetOf(menu)?.pageKeys ?? []).map(key => [key, null])) })} className="min-w-0 flex-1 text-sm font-medium hover:text-accent-primary hover:underline">{tx(menu.label)}</PlatformLink>
            <span className="text-tiny text-text-muted">{affiliation(menu)}</span>
            <button type="button" onClick={event => removeFavoriteRow(menu.id, event.currentTarget)} className="rounded-xs px-2 py-1 text-xs text-text-secondary hover:bg-surface-sunken">{t('removeFavorite')}</button>
          </li>)}</ul>}
      </Panel>

      <section aria-label={m('operationsHomeWorkSystems')}>
        {accessibleSpaces.length === 0
          ? <div className="rounded-lg border border-border-subtle bg-surface-card elevation-panel p-4">
              <h2 className="t-section-title">{m('operationsHomeNoWorkSystemsAreAvailable')}</h2>
              {permissionRequests.allowed
                ? <>
                    <p className="mt-1 text-sm text-text-secondary">{m('operationsHomeWorkSystemAccessIsGrantedByA')}</p>
                    <Button asChild size="sm" className="mt-3"><PlatformLink href={permissionRequests.href}>{m('operationsHomeRequestAccess')}</PlatformLink></Button>
                  </>
                : <p className="mt-1 text-sm text-text-secondary">{m('operationsHomeAskAPlatformAdministratorForAccessTo')}</p>}
            </div>
          : launcherGroups.length > 0 ? <div className="space-y-4">{launcherSections.map((group, index) => <section key={index} className="space-y-2">
              <h2 className="t-section-title">{tx(group.label)}</h2>
              <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-card elevation-panel">{group.spaces.map(compactEntry)}</ul>
            </section>)}</div>
          : <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-card elevation-panel">{accessibleSpaces.map(compactEntry)}</ul>}
      </section>

      <section aria-label={m('operationsHomeNotices')} className="space-y-2">
        {noticesLink.allowed && <PlatformLink href={noticesLink.href} className="inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:underline">{m('operationsHomeNoticeList')}</PlatformLink>}
        {notices.response && notices.response.outcome === 'ok' && notices.response.data!.filter(notice => !dismissed.includes(notice.id)).map(notice =>
          <div key={notice.id} role="status" className="flex items-start gap-3 rounded-md border border-accent-primary/30 bg-accent-primary-soft px-4 py-2.5 text-sm">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-accent-primary" aria-hidden />
            <span className="flex-1"><span className="t-mono mr-2 text-tiny text-text-muted">{notice.id}</span>{tx(notice.title)}</span>
            <button type="button" aria-label={m('operationsHomeDismissForThisVisit')} className="grid size-6 place-items-center rounded-xs text-text-muted hover:bg-surface-card"
              onClick={() => dismissNotice(notice.id)}><X className="size-3.5" aria-hidden /></button>
          </div>)}
        {notices.response && !isAnswered(notices.response.outcome) && <QueryView widgetName={m('operationsHomeNotices2')} hideWidgetName query={notices} compact>{() => null}</QueryView>}
      </section>
    </div>
  </PlatformPage>;
}
