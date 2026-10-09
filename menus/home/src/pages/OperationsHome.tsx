import { Clock3, Megaphone, Star, X } from 'lucide-react';
import { type MenuEntry, PlatformLink, useI18n, useMenuQuery, usePlatform } from '@ap/kernel';
import { noticesEndpoint } from '../endpoints';
import { dismissNotice, useDismissedNotices } from './dismissed-notices';
import { Panel, PlatformPage, QueryView } from '@ap/components';
import { StatusBadge } from '@ap/ui';

/** Platform home (ADR-0028, 15 §3.1): space cards, then recent and favorites, then notices. */
export default function OperationsHome() {
  const { favorites, toggleFavorite, recent, linkTo, global, registry, accessibleSpaces, canOpen, resolveLink, spaceEntry } = usePlatform();
  const { t, tx, lang } = useI18n();
  const dismissed = useDismissedNotices();
  const notices = useMenuQuery(noticesEndpoint, { targetScopeId: global.scopeId });
  const voc = resolveLink('voc');
  const noticesLink = resolveLink('notices');
  const homeId = registry.matchRoute('/')?.menu.id;

  const favoriteMenus = favorites.map(id => registry.menus.find(menu => menu.id === id)).filter((menu): menu is MenuEntry => !!menu && canOpen(menu.id));
  const recentRows = recent.filter(row => row.menuId !== homeId).map(row => {
    const menu = registry.menus.find(item => item.id === row.menuId);
    return menu && canOpen(menu.id) ? { ...row, menu } : null;
  }).filter((row): row is { menuId: string; url: string; at: number; menu: MenuEntry } => row !== null).slice(0, 5);
  const ago = (at: number) => {
    const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
    return mins < 1 ? (lang === 'ko' ? '방금' : 'just now') : mins < 60 ? (lang === 'ko' ? `${mins}분 전` : `${mins}m ago`) : (lang === 'ko' ? `${Math.round(mins / 60)}시간 전` : `${Math.round(mins / 60)}h ago`);
  };
  const affiliation = (menu: MenuEntry) => {
    const space = registry.spaceOf(menu);
    return space ? tx(space.label) : (lang === 'ko' ? '플랫폼' : 'Platform');
  };

  return <PlatformPage secondaryActions={canOpen('voc') ? <PlatformLink href={voc.href} className="text-xs font-medium text-accent-primary hover:underline">{lang === 'ko' ? '내 VOC' : 'My VOC'}</PlatformLink> : undefined}>
    <div className="space-y-4">
      <section aria-label={lang === 'ko' ? '업무 시스템' : 'Work systems'}>
        {accessibleSpaces.length === 0
          ? <div className="rounded-lg border border-border-subtle bg-surface-card p-4">
              <h2 className="t-section-title">{lang === 'ko' ? '접근 가능한 업무 시스템이 없습니다' : 'No work systems are available'}</h2>
              <p className="mt-1 text-sm text-text-secondary">{lang === 'ko' ? '필요한 업무 시스템의 접근 권한을 플랫폼 관리자에게 요청하세요.' : 'Ask a platform administrator for access to the work system you need.'}</p>
            </div>
          : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {accessibleSpaces.map(space => {
                const home = registry.menuById(space.homeMenuId);
                const Icon = registry.groupById(home.group).icon;
                const entry = spaceEntry(space.id);
                if (!entry) return null;
                const href = entry.href;
                const resumeMenu = entry.resumed ? registry.menus.find(menu => menu.id === entry.menuId) : undefined;
                return <PlatformLink key={space.id} href={href} className="rounded-lg border border-border-subtle bg-surface-card p-4 hover:border-accent-primary">
                  <span className="grid size-10 place-items-center rounded-md bg-icon-blue-soft text-accent-primary"><Icon className="size-6" strokeWidth={1.75} aria-hidden /></span>
                  <span className="mt-3 block t-card-title">{tx(space.label)}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{tx(space.description)}</span>
                  {resumeMenu && <span className="mt-2 block text-xs text-text-secondary">{lang === 'ko' ? `이어서: ${tx(resumeMenu.label)}` : `Continue: ${tx(resumeMenu.label)}`}</span>}
                </PlatformLink>;
              })}
            </div>}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={<span className="inline-flex items-center gap-2"><Star className="size-4 text-accent-warn" aria-hidden />{t('favorites')}</span>} subtitle={lang === 'ko' ? '지금 조회 조건을 유지하고 그 화면의 기본 보기로 이동합니다.' : "Opens the screen's default view with your current filters."}>
          {favoriteMenus.length === 0 ? <p className="rounded-md bg-surface-sunken p-3 text-xs text-text-secondary">{t('noFavorites')}</p> :
            <ul className="divide-y divide-border-subtle">{favoriteMenus.map(menu => <li key={menu.id} className="flex items-center gap-3 py-2">
              <menu.icon className="size-4 text-text-muted" aria-hidden />
              <PlatformLink href={linkTo(menu.id)} className="min-w-0 flex-1 text-sm font-medium hover:text-accent-primary hover:underline">{tx(menu.label)}</PlatformLink>
              <span className="text-tiny text-text-muted">{affiliation(menu)}</span>
              <button type="button" onClick={() => toggleFavorite(menu.id)} className="rounded-xs px-2 py-1 text-xs text-text-secondary hover:bg-surface-sunken">{t('removeFavorite')}</button>
            </li>)}</ul>}
        </Panel>
        <Panel title={<span className="inline-flex items-center gap-2"><Clock3 className="size-4 text-text-muted" aria-hidden />{t('recent')}</span>} subtitle={lang === 'ko' ? '방문했던 조회 조건으로 돌아갑니다. 권한은 다시 확인합니다.' : 'Returns with the filters you used. Access is checked again.'}>
          {recentRows.length === 0 ? <p className="rounded-md bg-surface-sunken p-3 text-xs text-text-secondary">{t('noRecent')}</p> :
            <ul className="divide-y divide-border-subtle">{recentRows.map(row => <li key={row.menuId} className="flex items-center gap-3 py-2">
              <row.menu.icon className="size-4 text-text-muted" aria-hidden />
              <PlatformLink href={row.url} className="min-w-0 flex-1 text-sm font-medium hover:text-accent-primary hover:underline">{tx(row.menu.label)}</PlatformLink>
              <span className="text-tiny text-text-muted">{affiliation(row.menu)}</span>
              <StatusBadge tone="neutral">{ago(row.at)}</StatusBadge>
            </li>)}</ul>}
        </Panel>
      </div>

      <section aria-label={lang === 'ko' ? '공지' : 'Notices'} className="space-y-2">
        {canOpen('notices') && <PlatformLink href={noticesLink.href} className="inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:underline">{lang === 'ko' ? '공지 목록' : 'Notice list'}</PlatformLink>}
        {notices.response && notices.response.outcome === 'ok' && notices.response.data!.filter(notice => !dismissed.includes(notice.id)).map(notice =>
          <div key={notice.id} role="status" className="flex items-start gap-3 rounded-md border border-accent-primary/30 bg-accent-primary-soft px-4 py-2.5 text-sm">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-accent-primary" aria-hidden />
            <span className="flex-1"><span className="t-mono mr-2 text-tiny text-text-muted">{notice.id}</span>{tx(notice.title)}</span>
            <button type="button" aria-label={lang === 'ko' ? '이번 세션 동안 닫기' : 'Dismiss for this session'} className="grid size-6 place-items-center rounded-xs text-text-muted hover:bg-surface-card"
              onClick={() => dismissNotice(notice.id)}><X className="size-3.5" aria-hidden /></button>
          </div>)}
        {notices.response && !['ok', 'empty'].includes(notices.response.outcome) && <QueryView widgetName={lang === 'ko' ? '공지' : 'Notices'} query={notices} compact>{() => null}</QueryView>}
      </section>
    </div>
  </PlatformPage>;
}
