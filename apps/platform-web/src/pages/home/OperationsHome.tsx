import { ArrowRight, Clock3, Lock, Megaphone, Star, X } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../kernel/i18n';
import { PlatformLink, usePlatform } from '../../kernel/platform';
import { usePlatformQuery } from '../../kernel/query';
import { GROUPS, MENUS, PAGE_TYPE_LABELS } from '../../kernel/registry';
import { serve } from '../../mock/server';
import { Panel, PlatformPage } from '../../platform/PlatformPage';
import { QueryView } from '../../platform/StateView';
import { StatusBadge } from '../../platform/StatusBadge';

type Notice = { id: string; title: { ko: string; en: string }; scopeId: string | null; until: string };
const NOTICES: Notice[] = [
  { id: 'N-2026-091', title: { ko: '9/28(일) 02:00–04:00 mart 재계산 작업으로 생산성 지표가 잠정 표시됩니다.', en: 'Sep 28 02:00–04:00: productivity metrics show as provisional during mart recompute.' }, scopeId: 'ICH', until: '2026-09-29T00:00:00' },
  { id: 'N-2026-088', title: { ko: 'CJU PH-301 설비 마스터 정정 반영 완료 — 지난 7일 값이 달라질 수 있습니다.', en: 'CJU PH-301 master correction applied — the last 7 days may change.' }, scopeId: 'CJU', until: '2026-09-30T00:00:00' },
];
const DISMISS = 'platform:notice-dismissed';
const readDismissed = (): string[] => { try { return JSON.parse(sessionStorage.getItem(DISMISS) || '[]'); } catch { return []; } };

/** 08 운영 개요(랜딩): consumes kernel menu visibility, favorites and recent; applies no analysis Context. */
export default function OperationsHome() {
  const { visibleMenus, favorites, toggleFavorite, recent, linkTo, global, role } = usePlatform();
  const { t, tx, lang } = useI18n();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  // Notice targeting is by the current requested scopeId (08 §6, Decided).
  const notices = usePlatformQuery(signal => serve({
    role, global, signal, requiresScope: false, mergeTimeDomain: false, latency: 250, kinds: [],
    compute: () => NOTICES.filter(n => n.scopeId === global.scopeId),
    isEmpty: rows => rows.length === 0,
  }), 'notices');

  const favoriteMenus = favorites.map(id => MENUS.find(m => m.id === id)).filter(m => m && visibleMenus.includes(m));
  const recentRows = recent.filter(r => visibleMenus.some(m => m.id === r.menuId));
  const ago = (at: number) => {
    const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
    return mins < 1 ? (lang === 'ko' ? '방금' : 'just now') : mins < 60 ? (lang === 'ko' ? `${mins}분 전` : `${mins}m ago`) : (lang === 'ko' ? `${Math.round(mins / 60)}시간 전` : `${Math.round(mins / 60)}h ago`);
  };

  return <PlatformPage title={lang === 'ko' ? '운영 개요' : 'Operations overview'}>
    <div className="space-y-4">
      {notices.response && notices.response.outcome === 'ok' && notices.response.data!.filter(n => !dismissed.includes(n.id)).map(n =>
        <div key={n.id} role="status" className="flex items-start gap-3 rounded-md border border-accent-primary/30 bg-accent-primary-soft px-4 py-2.5 text-[13px]">
          <Megaphone className="mt-0.5 size-4 shrink-0 text-accent-primary" aria-hidden />
          <span className="flex-1"><span className="t-mono mr-2 text-[11px] text-text-muted">{n.id}</span>{tx(n.title)}</span>
          <PlatformLink href={linkTo('notices')} className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-accent-primary hover:underline">{lang === 'ko' ? '전체 공지 보기' : 'All notices'}<ArrowRight className="size-3" aria-hidden /></PlatformLink>
          <button type="button" aria-label={lang === 'ko' ? '이번 세션 동안 닫기' : 'Dismiss for this session'} className="grid size-6 place-items-center rounded-xs text-text-muted hover:bg-surface-card"
            onClick={() => { const next = [...dismissed, n.id]; setDismissed(next); try { sessionStorage.setItem(DISMISS, JSON.stringify(next)); } catch { /* ignore */ } }}><X className="size-3.5" aria-hidden /></button>
        </div>)}
      {notices.response && !['ok', 'empty'].includes(notices.response.outcome) && <QueryView query={notices} compact>{() => null}</QueryView>}

      <section aria-labelledby="home-groups">
        <h2 id="home-groups" className="t-section-title mb-2">{lang === 'ko' ? '내 메뉴 바로가기' : 'My menus'}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 wide:grid-cols-6">
          {GROUPS.filter(g => g.id !== 'overview').map(g => {
            const inGroup = visibleMenus.filter(m => m.group === g.id && !m.navHidden);
            if (!inGroup.length) return null;
            const primary = MENUS.find(m => m.group === g.id && m.primary)!;
            const allowed = visibleMenus.includes(primary);
            const Icon = g.icon;
            const body = <>
              <span className="grid size-10 place-items-center rounded-md bg-icon-blue-soft text-accent-primary"><Icon className="size-6" strokeWidth={1.75} aria-hidden /></span>
              <span className="mt-3 block t-card-title">{tx(g.label)}</span>
              <span className="mt-0.5 block text-[12px] text-text-muted">{lang === 'ko' ? `메뉴 ${inGroup.length}개 · ` : `${inGroup.length} menus · `}{tx(primary.label)}</span>
            </>;
            // Open (08 §8): primary destination forbidden but siblings allowed — rendered disabled with the reason, never re-targeted.
            return allowed
              ? <PlatformLink key={g.id} href={linkTo(primary.id)} className="rounded-lg border border-border-subtle bg-surface-card p-4 transition-colors hover:border-accent-primary">{body}</PlatformLink>
              : <div key={g.id} aria-disabled className="rounded-lg border border-dashed border-border-strong bg-surface-card p-4 opacity-70" title={lang === 'ko' ? '대표 목적지 권한 없음 (Open)' : 'No access to primary destination (Open)'}>{body}<span className="mt-1 flex items-center gap-1 text-[11px] text-text-warning"><Lock className="size-3" aria-hidden />{lang === 'ko' ? '대표 목적지 권한 없음' : 'Primary destination restricted'}</span></div>;
          })}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={<span className="inline-flex items-center gap-2"><Star className="size-4 text-accent-warn" aria-hidden />{t('favorites')}</span>} subtitle={lang === 'ko' ? '목적지 ID만 저장합니다. 클릭 시 그 화면의 기본 상태로 진입하고, 지금 들고 있는 전역 Context는 보존됩니다.' : 'Stores destination IDs only; opens the default state while carrying the current global context.'}>
          {favoriteMenus.length === 0 ? <p className="rounded-md bg-surface-sunken p-3 text-[12px] text-text-secondary">{t('noFavorites')}</p> :
            <ul className="divide-y divide-border-subtle">{favoriteMenus.map(m => m && <li key={m.id} className="flex items-center gap-3 py-2">
              <m.icon className="size-4 text-text-muted" aria-hidden />
              <PlatformLink href={linkTo(m.id)} className="flex-1 text-[13px] font-medium hover:text-accent-primary hover:underline">{tx(m.label)}</PlatformLink>
              <span className="text-[11px] text-text-muted">{tx(PAGE_TYPE_LABELS[m.pageType])}</span>
              <button type="button" onClick={() => toggleFavorite(m.id)} className="rounded-xs px-2 py-1 text-[12px] text-text-secondary hover:bg-surface-sunken">{t('removeFavorite')}</button>
            </li>)}</ul>}
        </Panel>
        <Panel title={<span className="inline-flex items-center gap-2"><Clock3 className="size-4 text-text-muted" aria-hidden />{t('recent')}</span>} subtitle={lang === 'ko' ? '방문 당시 URL(Context 포함)로 돌아갑니다. 진입 시 권한·Scope를 다시 검증합니다.' : 'Returns to the visited URL (with context); access is re-validated on entry.'}>
          {recentRows.length === 0 ? <p className="rounded-md bg-surface-sunken p-3 text-[12px] text-text-secondary">{t('noRecent')}</p> :
            <ul className="divide-y divide-border-subtle">{recentRows.map(r => { const m = MENUS.find(x => x.id === r.menuId)!; return <li key={r.menuId} className="flex items-center gap-3 py-2">
              <m.icon className="size-4 text-text-muted" aria-hidden />
              <PlatformLink href={r.url} className="min-w-0 flex-1 text-[13px] font-medium hover:text-accent-primary hover:underline">{tx(m.label)}<span className="t-mono ml-2 hidden truncate text-[11px] font-normal text-text-muted wide:inline">{decodeURIComponent(r.url).slice(0, 72)}</span></PlatformLink>
              <StatusBadge tone="neutral">{ago(r.at)}</StatusBadge>
            </li>; })}</ul>}
        </Panel>
      </div>
    </div>
  </PlatformPage>;
}
