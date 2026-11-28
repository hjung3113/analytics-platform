import { useEffect, useMemo, useState } from 'react';
import { Bookmark, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { PEOPLE_LOOKUP_MAX, type MenuView } from '@ap/contracts';
import { PlatformLink, useI18n, useMessages } from '@ap/kernel';
import { useHostPlatform, useMyMenus } from '@ap/kernel/host';
import { cn, navRowVariants } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';
import { SIDEBAR_GROUP_TITLE } from './SidebarHierarchy';

type Item = { view: MenuView; owner?: string };

export function MyMenusSection() {
  const { savedViewStore: store, session, revision, user, scope, adapter, canOpen, route, registry, resolveLink, reportShellError } = useHostPlatform();
  const { revision: writes, open } = useMyMenus();
  const read = useMemo(() => ({ store, session, revision, userId: user.id, scopeId: scope.scopeId, writes, adapter, canOpen, reportShellError }), [store, session, revision, user.id, scope.scopeId, writes, adapter, canOpen, reportShellError]);
  const [result, setResult] = useState<{ read: typeof read; items: Item[] }>();
  useEffect(() => {
    const { store } = read;
    if (!store?.listMyMenus) return;
    const controller = new AbortController();
    const load = async () => {
      const entries = await store.listMyMenus?.(read.userId) ?? [];
      if (controller.signal.aborted) return;
      const views = entries.flatMap(({ view, capabilities }) => view.kind === 'menu-view' && capabilities.canView && read.canOpen(view.menuId) ? [view] : []);
      const ids = [...new Set(views.map(view => view.ownerId).filter(id => id !== read.userId))];
      const lookups = [];
      for (let i = 0; i < ids.length; i += PEOPLE_LOOKUP_MAX) {
        // A failed directory chunk falls back to the owner ID, as in the view selector.
        lookups.push(read.adapter.lookupPeople(ids.slice(i, i + PEOPLE_LOOKUP_MAX), controller.signal).catch(() => []));
      }
      const names = new Map((await Promise.all(lookups)).flat().map(person => [person.userId, person.displayName]));
      if (!controller.signal.aborted) setResult({ read, items: views.map(view => ({
        view, owner: view.ownerId === read.userId ? undefined : names.get(view.ownerId) || view.ownerId,
      })) });
    };
    void load().catch(error => {
      // Hide just this section if its list cannot be read.
      if (!controller.signal.aborted) read.reportShellError(error);
    });
    return () => controller.abort();
  }, [read]);

  const m = useMessages(SHELL_MESSAGES);
  const { tx } = useI18n();
  const rows = result?.read === read ? result.items.flatMap(({ view, owner }) => {
    const menu = registry.menuById(view.menuId);
    const params = route?.menu.id === view.menuId ? route.params : undefined;
    // A view stores a menu ID; another parameterized path needs its own destination parameters.
    if (!params && menu.path.split('/').some(segment => segment.startsWith(':'))) return [];
    const target = resolveLink(view.menuId, { params });
    if (!target.allowed || target.href === null) return [];
    return [{ view, owner, href: target.href, Icon: menu.icon, source: tx(menu.label) }];
  }) : [];
  if (!open || rows.length === 0) return null;
  const owned = rows.filter(row => row.owner === undefined);
  const shared = rows.filter(row => row.owner !== undefined);
  return <section data-my-menus aria-label={m('myMenus')}>
    <p className={cn(SIDEBAR_GROUP_TITLE, 'mt-3.5 flex items-center gap-1')}><Bookmark className="size-3" aria-hidden />{m('myMenus')}</p>
    <MyMenusGroup label={m('myMenusOwned')} count={owned.length}>
      {owned.map(renderRow)}
    </MyMenusGroup>
    <MyMenusGroup label={m('myMenusShared')} count={shared.length}>
      {shared.map(renderRow)}
    </MyMenusGroup>
  </section>;

  function renderRow({ view, owner, href, Icon, source }: typeof rows[number]) {
    const name = [view.name, source, owner === undefined ? null : m('myMenusSharedBy', { owner })].filter(Boolean).join(' · ');
    return <li key={view.id}><PlatformLink href={href} aria-label={name} title={name}
      className={cn(navRowVariants({ active: false }), 'h-auto py-1.5 items-start')}
      onClick={event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        open?.(view.menuId, view.id, href);
      }}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1"><span className="block truncate">{view.name}</span>
        <span className="block truncate text-caption text-text-muted">{source}{owner === undefined ? '' : ` · ${owner}`}</span></span>
      {owner !== undefined && <Users className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />}
    </PlatformLink></li>;
  }
}

function MyMenusGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return <div role="group" aria-label={label}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex h-6 w-full items-center gap-1 rounded-md px-3 text-caption text-text-secondary hover:bg-surface-row-hover">
      <Chevron className="size-3" aria-hidden />{label}<span className="ml-auto text-text-muted">{count}</span>
    </button>
    {open && <ul className="space-y-0.5">{children}</ul>}
  </div>;
}
