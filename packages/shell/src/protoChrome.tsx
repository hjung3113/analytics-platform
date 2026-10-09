// THROWAWAY #250 — never merge.
import { Clock3, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SpaceDef, SpaceId, Text } from '@ap/contracts';
import { PlatformLink, useI18n, usePlatform, type MenuEntry, type PlatformSlots, type Registry } from '@ap/kernel';
import { Button, cn, Popover, PopoverContent, PopoverTrigger, type ProtoVariant, usePrototype } from '@ap/ui';
import { PopoverFeedbackOpsHub, useProtoHubHref } from './feedbackOpsNav';
import { readLastSpaceId, readLastUrls, restoreHref } from './spaceMemory';

const BLURB: Partial<Record<SpaceId, Text>> = {
  productivity: { ko: '사이클타임과 설비 생산성을 분석합니다.', en: 'Analyze cycle time and equipment productivity.' },
  metrics: { ko: '지표 정의, 버전, 발행을 관리합니다.', en: 'Manage metric definitions, versions and release.' },
  logdev: { ko: '설비 모델의 표준 로그를 개발하고 검증합니다.', en: 'Develop and validate standard equipment logs.' },
  improvement: { ko: '개선 과제의 현장 적용과 성과를 다룹니다.', en: 'Track shop-floor application and results.' },
  operations: { ko: '서버, 권한, 감사를 운영합니다.', en: 'Run servers, access and audit.' },
  common: { ko: '설비, 기준정보, 공지를 함께 둡니다.', en: 'Equipment, master data and notices.' },
};

/** The app passes `protoFeedbackOps` only for this prototype. Shell tests omit it and keep the shipped chrome. */
export function isProtoRegistry(slots: PlatformSlots) {
  return typeof slots.protoFeedbackOps === 'function';
}

export function displaySpace(opts: {
  proto: boolean;
  variant: ProtoVariant;
  pathname: string;
  sidebarSpace: SpaceDef;
  accessible: readonly SpaceDef[];
  lastId: string | null;
}): SpaceDef {
  const { proto, variant, pathname, sidebarSpace, accessible, lastId } = opts;
  if (!proto) return sidebarSpace;
  if ((variant === 'B' || variant === 'C') && pathname === '/') return accessible.find(s => s.id === lastId) ?? accessible[0] ?? sidebarSpace;
  return sidebarSpace;
}

export function useOpenSpace() {
  const { registry, can, linkTo, navigate, currentSpace, pathname } = usePlatform();
  return (spaceId: SpaceId) => {
    if (pathname !== '/' && currentSpace?.id === spaceId) return;
    navigate(restoreHref(registry, spaceId, can, linkTo));
  };
}

function spaceIcon(registry: Registry, space: SpaceDef) {
  return registry.groupById(registry.menuById(space.homeMenuId).group).icon;
}

function menuCount(menusInSpace: (id: SpaceId) => MenuEntry[], spaceId: SpaceId) {
  return menusInSpace(spaceId).filter(m => !m.navHidden).length;
}

export function EmptyWork() {
  const { lang } = useI18n();
  return <div>
    <header className="flex h-[50px] items-center border-b border-border-subtle px-4">
      <h1 className="truncate text-sm font-semibold text-text-primary">{lang === 'ko' ? '접근 가능한 업무 시스템이 없습니다' : 'No work system is available'}</h1>
    </header>
    <p className="max-w-xl px-4 py-6 text-sm text-text-secondary">
      {lang === 'ko'
        ? '플랫폼 관리자에게 필요한 업무 시스템의 진입 권한을 요청하세요. 지금은 플랫폼 홈만 사용할 수 있습니다.'
        : 'Ask a platform admin for access to a work system. Only the platform home is available.'}
    </p>
  </div>;
}

export function WorkspaceHome() {
  const variant = usePrototype();
  const { accessibleSpaces, favorites, recent, registry, menusInSpace, linkTo, can } = usePlatform();
  const { tx, lang } = useI18n();
  const openSpace = useOpenSpace();
  const works = accessibleSpaces;
  const saved = readLastUrls();
  const favoriteMenus = favorites.map(id => registry.menus.find(m => m.id === id)).filter((m): m is MenuEntry => !!m && can(m.permission));
  const recentRows = recent.filter(r => registry.menus.some(m => m.id === r.menuId)).slice(0, variant === 'C' ? 8 : 12);
  return <div>
    <header className="flex h-[50px] items-center border-b border-border-subtle px-4">
      <h1 className="truncate text-sm font-semibold text-text-primary">{lang === 'ko' ? '플랫폼 홈' : 'Platform home'}</h1>
    </header>
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-8 py-7">
      {variant === 'C'
        ? <RecentFirst rows={recentRows} />
        : variant === 'B'
          ? <LauncherBody works={works} limit={5} />
          : <CardGrid works={works} saved={saved} onOpen={openSpace} />}
      {variant === 'C' && <SystemRows works={works} onOpen={openSpace} />}
      {variant === 'A' && <NoticeBlock />}
      {variant === 'A' && <div className="grid gap-6 md:grid-cols-2">
        <section aria-label={lang === 'ko' ? '즐겨찾기' : 'Favorites'}>
          <h2 className="mb-2 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-secondary"><Star className="size-3" aria-hidden />{lang === 'ko' ? '즐겨찾기' : 'Favorites'}</h2>
          {favoriteMenus.length === 0
            ? <p className="text-sm text-text-secondary">{lang === 'ko' ? '즐겨찾기가 없습니다.' : 'No favorites.'}</p>
            : <ul className="space-y-1">{favoriteMenus.map(menu => <li key={menu.id}><HomeLink menu={menu} href={linkTo(menu.id)} /></li>)}</ul>}
        </section>
        <section aria-label={lang === 'ko' ? '최근 방문' : 'Recent'}>
          <h2 className="mb-2 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-secondary"><Clock3 className="size-3" aria-hidden />{lang === 'ko' ? '최근 방문' : 'Recent'}</h2>
          {recentRows.length === 0
            ? <p className="text-sm text-text-secondary">{lang === 'ko' ? '최근 방문한 화면이 없습니다.' : 'No recent pages.'}</p>
            : <ul className="space-y-1">{recentRows.map(row => {
              const menu = registry.menuById(row.menuId);
              return <li key={row.menuId}><HomeLink menu={menu} href={row.url} when={row.at} /></li>;
            })}</ul>}
        </section>
      </div>}
      {variant === 'A' && works.length === 1 && <Button type="button" onClick={() => openSpace(works[0].id)}>{lang === 'ko' ? '바로 들어가기' : 'Enter now'}</Button>}
    </div>
  </div>;
}

function HomeLink({ menu, href, when }: { menu: MenuEntry; href: string; when?: number }) {
  const { registry } = usePlatform();
  const { tx, lang } = useI18n();
  const space = registry.spaceOf(menu);
  return <PlatformLink href={href} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-row-hover">
    <span className="min-w-0 truncate">{tx(menu.label)}</span>
    <span className="shrink-0 text-caption text-text-secondary">{tx(space.label)}{when !== undefined && ` · ${formatWhen(when, lang)}`}</span>
  </PlatformLink>;
}

function CardGrid({ works, saved, onOpen }: { works: readonly SpaceDef[]; saved: Partial<Record<SpaceId, string>>; onOpen: (id: SpaceId) => void }) {
  const { registry } = usePlatform();
  const { tx, lang } = useI18n();
  return <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {works.map(space => {
      const Icon = spaceIcon(registry, space);
      const blurb = BLURB[space.id];
      return <li key={space.id}>
        <button type="button" onClick={() => onOpen(space.id)} className="flex h-full w-full flex-col items-start gap-2 rounded-lg border border-border-subtle bg-surface-card p-4 text-left hover:bg-surface-row-hover">
          <Icon className="size-4 text-text-secondary" aria-hidden />
          <span className="text-sm font-semibold text-text-primary">{tx(space.label)}</span>
          {blurb && <span className="text-sm text-text-secondary">{tx(blurb)}</span>}
          {saved[space.id] && <span className="text-caption text-accent-primary">{lang === 'ko' ? '마지막 화면으로' : 'Last page'}</span>}
        </button>
      </li>;
    })}
  </ul>;
}

function SystemRows({ works, onOpen }: { works: readonly SpaceDef[]; onOpen: (id: SpaceId) => void }) {
  const { registry, menusInSpace } = usePlatform();
  const { tx, lang } = useI18n();
  return <section aria-label={lang === 'ko' ? '업무 시스템' : 'Work systems'}>
    <h2 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-secondary">{lang === 'ko' ? '업무 시스템' : 'Work systems'}</h2>
    <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-card">
      {works.map(space => {
        const Icon = spaceIcon(registry, space);
        return <li key={space.id}>
          <button type="button" onClick={() => onOpen(space.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-row-hover">
            <Icon className="size-4 text-text-secondary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm">{tx(space.label)}</span>
            <span className="text-caption text-text-secondary">{menuCount(menusInSpace, space.id)}</span>
          </button>
        </li>;
      })}
    </ul>
  </section>;
}

function RecentFirst({ rows }: { rows: { menuId: string; url: string; at: number }[] }) {
  const { registry } = usePlatform();
  const { tx, lang } = useI18n();
  return <section aria-label={lang === 'ko' ? '최근 작업' : 'Recent work'}>
    <h2 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-secondary">{lang === 'ko' ? '최근 작업' : 'Recent work'}</h2>
    {rows.length === 0
      ? <p className="text-sm text-text-secondary">{lang === 'ko' ? '최근 작업이 없습니다. 아래에서 시스템을 고르세요.' : 'No recent work. Choose a system below.'}</p>
      : <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-card">
        {rows.map(row => {
          const menu = registry.menuById(row.menuId);
          return <li key={row.menuId}>
            <PlatformLink href={row.url} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-row-hover">
              <span className="min-w-0 flex-1 truncate">{tx(menu.label)}</span>
              <span className="rounded-pill bg-surface-sunken px-2 py-0.5 text-caption text-text-secondary">{tx(registry.spaceOf(menu).label)}</span>
              <span className="text-caption text-text-secondary">{formatWhen(row.at, lang)}</span>
            </PlatformLink>
          </li>;
        })}
      </ul>}
  </section>;
}

const NOTES = [
  { title: { ko: '드릴다운 레이아웃이 적용되었습니다', en: 'Drill-down layout is in place' }, at: '2026-10-08' },
  { title: { ko: '지표 카탈로그 점검 안내', en: 'Metric catalog check' }, at: '2026-10-06' },
  { title: { ko: '합성 데이터 기준일이 갱신되었습니다', en: 'Synthetic data date moved forward' }, at: '2026-10-01' },
];

function NoticeBlock() {
  const { registry, linkTo, can } = usePlatform();
  const { tx, lang } = useI18n();
  const notices = registry.menus.find(m => m.path === '/notices');
  const href = notices && can(notices.permission) ? linkTo(notices.id) : null;
  return <section aria-label={lang === 'ko' ? '공지' : 'Notices'}>
    <h2 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-secondary">{lang === 'ko' ? '공지' : 'Notices'}</h2>
    <ul className="space-y-1 rounded-lg border border-border-subtle bg-surface-card p-2">
      {NOTES.map(note => <li key={note.at} className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
        <span className="min-w-0 truncate">{tx(note.title)}</span>
        <span className="shrink-0 text-caption text-text-secondary">{note.at}</span>
      </li>)}
    </ul>
    {href && <PlatformLink href={href} className="mt-2 inline-block text-sm text-accent-primary">{lang === 'ko' ? '공지 목록' : 'All notices'}</PlatformLink>}
  </section>;
}

export function LauncherBody({ works, limit }: { works: readonly SpaceDef[]; limit: number }) {
  const { recent, registry, menusInSpace, navigate } = usePlatform();
  const { tx, lang } = useI18n();
  const openSpace = useOpenSpace();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const systems = works.filter(s => !needle || tx(s.label).toLowerCase().includes(needle) || (BLURB[s.id] && tx(BLURB[s.id]!).toLowerCase().includes(needle)));
  const latest = recent.filter(r => registry.menus.some(m => m.id === r.menuId)).slice(0, limit);
  return <div className="flex flex-col gap-3">
    <input value={q} onChange={e => setQ(e.target.value)} aria-label={lang === 'ko' ? '시스템 검색' : 'Search systems'} placeholder={lang === 'ko' ? '시스템 검색' : 'Search systems'}
      className="h-9 rounded-md border border-border-control bg-surface-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus-ring" />
    <section aria-label={lang === 'ko' ? '최근' : 'Recent'}>
      <h2 className="mb-1 text-caption font-semibold text-text-secondary">{lang === 'ko' ? '최근' : 'Recent'}</h2>
      {latest.length === 0
        ? <p className="px-1 text-sm text-text-secondary">{lang === 'ko' ? '최근 항목이 없습니다.' : 'Nothing recent.'}</p>
        : <ul>{latest.map(row => {
          const menu = registry.menuById(row.menuId);
          return <li key={row.menuId}><button type="button" onClick={() => navigate(row.url)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover">
            <span className="min-w-0 flex-1 truncate">{tx(menu.label)}</span>
            <span className="shrink-0 text-caption text-text-secondary">{tx(registry.spaceOf(menu).label)}</span>
          </button></li>;
        })}</ul>}
    </section>
    <section aria-label={lang === 'ko' ? '업무 시스템' : 'Work systems'}>
      <h2 className="mb-1 text-caption font-semibold text-text-secondary">{lang === 'ko' ? '업무 시스템' : 'Work systems'}</h2>
      <ul>{systems.map(space => {
        const Icon = spaceIcon(registry, space);
        return <li key={space.id}><button type="button" onClick={() => openSpace(space.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-row-hover">
          <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{tx(space.label)}</span>
          <span className="shrink-0 text-caption text-text-secondary">{lang === 'ko' ? `메뉴 ${menuCount(menusInSpace, space.id)}` : `${menuCount(menusInSpace, space.id)} menus`}</span>
        </button></li>;
      })}</ul>
    </section>
  </div>;
}

export function RailLogoLauncher() {
  const { accessibleSpaces } = usePlatform();
  const { t, lang } = useI18n();
  const hubHref = useProtoHubHref();
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={lang === 'ko' ? '업무 시스템 런처' : 'Work system launcher'} title={t('appName')} className="mb-1 grid size-8 shrink-0 place-items-center rounded-md bg-accent-primary text-sm font-semibold text-text-on-accent">
        <span aria-hidden>A</span>
      </button>
    </PopoverTrigger>
    <PopoverContent side="right" align="start" className="w-80">
      <LauncherBody works={accessibleSpaces} limit={5} />
      {hubHref && <PopoverFeedbackOpsHub href={hubHref} />}
    </PopoverContent>
  </Popover>;
}

export function useShownSpace() {
  const variant = usePrototype();
  const { slots, sidebarSpace, accessibleSpaces, pathname } = usePlatform();
  const proto = isProtoRegistry(slots);
  const lastId = proto ? readLastSpaceId() : null;
  return useMemo(() => displaySpace({
    proto, variant, pathname, sidebarSpace, accessible: accessibleSpaces, lastId,
  }), [proto, variant, pathname, sidebarSpace, accessibleSpaces, lastId]);
}

function formatWhen(at: number, lang: 'ko' | 'en') {
  try { return new Date(at).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

export function railButtonClass(active: boolean) {
  return cn('relative grid size-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover', active && 'bg-surface-row-selected text-accent-primary');
}
