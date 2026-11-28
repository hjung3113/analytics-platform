import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, ChevronDown, ChevronRight, Users, type LucideIcon } from 'lucide-react';
import type { MenuView } from '@ap/contracts';
import { PlatformLink, useI18n, useMessages } from '@ap/kernel';
import { useHostPlatform, useMyMenus } from '@ap/kernel/host';
import { Button, cn, navRowVariants, useIsTruncated } from '@ap/ui';
import { SHELL_MESSAGES } from '../messages';
import { lookupPeopleNames } from '../saved-view/lookupPeopleNames';
import { useSavedViewPickWarning } from '../saved-view/useSavedViewPickWarning';
import { SIDEBAR_GROUP_TITLE } from './SidebarHierarchy';

type Item = { view: MenuView; owner?: string };

export function MyMenusSection() {
  const { savedViewStore: store, session, revision, user, scope, adapter, canOpen, route, registry, resolveLink, reportShellError, toast } = useHostPlatform();
  const { revision: writes, open } = useMyMenus();
  const owner = useMemo(() => ({ store, session, revision, userId: user.id, scopeId: scope.scopeId, adapter, canOpen }), [store, session, revision, user.id, scope.scopeId, adapter, canOpen]);
  const reporter = useRef(reportShellError);
  useLayoutEffect(() => { reporter.current = reportShellError; }, [reportShellError]);
  const pickFailed = useSavedViewPickWarning(toast);
  const [result, setResult] = useState<{ owner: typeof owner; items: Item[] }>();
  useEffect(() => {
    const { store, userId, adapter, canOpen } = owner;
    if (!store?.listMyMenus) return;
    const controller = new AbortController();
    const load = async () => {
      const entries = await store.listMyMenus?.(userId) ?? [];
      if (controller.signal.aborted) return;
      const views = entries.flatMap(({ view, capabilities }) => view.kind === 'menu-view' && capabilities.canView && canOpen(view.menuId) ? [view] : []);
      const ids = [...new Set(views.map(view => view.ownerId).filter(id => id !== userId))];
      const names = await lookupPeopleNames(adapter, ids, controller.signal);
      if (!controller.signal.aborted) setResult({ owner, items: views.map(view => ({
        view, owner: view.ownerId === userId ? undefined : names.get(view.ownerId) ?? view.ownerId,
      })) });
    };
    void load().catch(error => {
      // Hide just this section if its list cannot be read.
      if (!controller.signal.aborted) {
        setResult(undefined);
        reporter.current(error);
      }
    });
    return () => controller.abort();
  }, [owner, writes]);

  const m = useMessages(SHELL_MESSAGES);
  const { tx } = useI18n();
  const rows = result?.owner === owner ? result.items.flatMap(({ view, owner }) => {
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
  return <section className="break-keep" data-my-menus aria-label={m('myMenus')}>
    <p className={cn(SIDEBAR_GROUP_TITLE, 'mt-3.5 flex items-center gap-1')}><Bookmark className="size-3" aria-hidden />{m('myMenus')}</p>
    <MyMenusGroup label={m('myMenusOwned')} count={owned.length}>
      {owned.map(row => <MyMenusRow key={row.view.id} {...row} open={open} onOutcome={pickFailed} />)}
    </MyMenusGroup>
    <MyMenusGroup label={m('myMenusShared')} count={shared.length}>
      {shared.map(row => <MyMenusRow key={row.view.id} {...row} open={open} onOutcome={pickFailed} />)}
    </MyMenusGroup>
  </section>;
}

type Row = Item & {
  href: string;
  Icon: LucideIcon;
  source: string;
  open: NonNullable<ReturnType<typeof useMyMenus>['open']>;
  onOutcome: ReturnType<typeof useSavedViewPickWarning>;
};

function MyMenusRow({ view, owner, href, Icon, source, open, onOutcome }: Row) {
  const m = useMessages(SHELL_MESSAGES);
  const nameRef = useRef<HTMLSpanElement>(null);
  const sourceRef = useRef<HTMLSpanElement>(null);
  const nameClipped = useIsTruncated(nameRef);
  const sourceClipped = useIsTruncated(sourceRef);
  const name = [view.name, source, owner === undefined ? null : m('myMenusSharedBy', { owner })].filter(Boolean).join(' · ');
  return <li><PlatformLink href={href} aria-label={name} title={nameClipped || sourceClipped ? name : undefined}
    className={cn(navRowVariants({ active: false }), 'h-auto py-1.5 items-start')}
    onClick={event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const row = event.currentTarget;
      open(view.menuId, view.id, href, {
        focusOrigin: () => {
          const { activeElement, body } = row.ownerDocument;
          if (row.isConnected && (activeElement === row || activeElement === body)) row.focus();
        },
        onOutcome,
      });
    }}>
    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
    <span className="min-w-0 flex-1"><span ref={nameRef} className="block truncate">{view.name}</span>
      <span ref={sourceRef} className="block truncate text-caption text-text-muted">{source}{owner === undefined ? '' : ` · ${owner}`}</span></span>
    {owner !== undefined && <Users className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden />}
  </PlatformLink></li>;
}

function MyMenusGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return <div role="group" aria-label={label}>
    <Button type="button" variant="navigation" size="toolbar" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="h-6 w-full justify-start whitespace-normal break-keep">
      <Chevron className="size-3" aria-hidden />{label}<span className="ml-auto text-text-muted">{count}</span>
    </Button>
    {open && <ul className="space-y-0.5">{children}</ul>}
  </div>;
}
