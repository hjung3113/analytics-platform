import { Ban, FileQuestion, Link2Off } from 'lucide-react';
import { CONTEXT_LABELS, PAGE_TYPE_LABELS, contractErrorSentence, useI18n, usePlatform } from '@ap/kernel';
import { Panel, PlatformPage, StateMessage, focusPageFallback } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import type { Capability, ContextKey } from '@ap/contracts';
import { contextBarVisible } from './GlobalContextBar';
import { HomeLink } from './HomeLink';
import { ModuleScreen } from './ModuleScreen';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { BoardScreen } from './board/BoardScreen';

/** The main screen's outlet: `ScreenOutlet` for the URL-bound screen, or the analysis board where the kernel says `/board` (a platform screen, docs/16). */
export function RouteOutlet() {
  const { platformScreen } = usePlatform();
  return platformScreen === 'board' ? <BoardScreen Outlet={ScreenOutlet} /> : <ScreenOutlet />;
}

/**
 * Renders whatever the nearest screen state points at — the matched menu page, or the kernel's not-found / contract-error /
 * permission / planned states (docs/06 §17, §19). Inside a board pane (`PaneScreenProvider`, ADR-0049) it runs the same gate
 * chain for that pane's menu, so a denied pane shows its own permission state.
 */
export function ScreenOutlet() {
  const { route, contractError, can, url, global, metricInit, setGlobal, currentSpace, reportError, revision } = usePlatform();
  const { t, tx, lang } = useI18n();
  if (!route) return <KernelMessage icon={<FileQuestion className="size-4" aria-hidden />} title={t('notFound')} body={<span className="t-mono">{url}</span>} />;
  if (contractError) return <ContractErrorView />;
  // Space entry is checked before the menu permission (06 §9.1/§2): the route still matches, but the page never mounts and nothing redirects.
  if (currentSpace !== null && currentSpace.permission !== undefined && !can(currentSpace.permission)) {
    return <KernelMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={lang === 'ko' ? '이 공간에 들어갈 수 없습니다' : 'You cannot enter this space'}
      body={<>{tx(currentSpace.label)}. {t('askAccessOwner')}</>} />;
  }
  if (metricInit.phase === 'confirm') {
    return <KernelMessage icon={<Link2Off className="size-4" aria-hidden />} title={lang === 'ko' ? '게시 버전 확인 중' : 'Confirming the published version'}
      body={lang === 'ko' ? '서버가 확인한 버전을 URL에 기록하기 전에는 조회하지 않습니다.' : 'Nothing is queried until the server-confirmed version is written into the URL.'} />;
  }
  if (metricInit.phase === 'blocked') {
    const id = global.metricId;
    const blockedBody = metricInit.reason === 'unknown_metric'
      ? (id
        ? (lang === 'ko' ? `${id} 지표를 열 수 없습니다. 지우고 다시 고르세요.` : `${id} cannot be opened. Clear it and choose again.`)
        : (lang === 'ko' ? '이 지표를 열 수 없습니다. 지우고 다시 고르세요.' : 'This metric cannot be opened. Clear it and choose again.'))
      : (lang === 'ko' ? '게시된 버전이 없습니다. 다른 지표를 고르세요.' : 'There is no published version. Choose another metric.');
    return <div className="p-6"><StateMessage tone="warning" icon={<Link2Off className="size-4" aria-hidden />}
      title={metricInit.reason === 'unknown_metric'
        ? (lang === 'ko' ? '지표를 확인하지 못했습니다' : 'The metric could not be confirmed')
        : (lang === 'ko' ? '게시 버전이 없습니다' : 'No published version')}
      body={blockedBody}
      action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); setGlobal({ metricId: null, metricVersion: null }, { replace: true }); }}>{lang === 'ko' ? '이 지표 쌍 지우기' : 'Clear this metric pair'}</Button>} /></div>;
  }
  // Direct URL to a menu hidden by permission: the server check still answers (§17), distinct from "no data".
  if (!can(route.menu.permission)) return <KernelMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={lang === 'ko' ? '이 메뉴에 대한 권한이 없습니다' : 'You do not have access to this menu'}
    body={<>{tx(route.menu.label)}. {t('askAccessOwner')}</>} />;
  const Page = route.menu.component;
  const pageKey = route.menu.id + JSON.stringify(route.params);
  // A module screen is a different instance per generation: a revision change remounts it and drops its local state.
  if (route.menu.moduleScreen) return <RouteErrorBoundary onError={reportError} resetKey={`${pageKey}|${revision}`}>
    <ModuleScreen key={`${pageKey}|${revision}`} entry={route.menu} params={route.params} />
  </RouteErrorBoundary>;
  if (!Page) return <PlannedPage />;
  return <RouteErrorBoundary onError={reportError} resetKey={`${pageKey}|${revision}`}>
    <Page key={pageKey} params={route.params} />
  </RouteErrorBoundary>;
}

function KernelMessage({ icon, title, body, tone }: { icon: React.ReactNode; title: string; body: React.ReactNode; tone?: 'warning' | 'danger' }) {
  return <div className="p-6"><StateMessage tone={tone} icon={icon} title={title} body={body} action={<HomeLink />} /></div>;
}

function ContractErrorView() {
  const { contractError, resetContext, url } = usePlatform();
  const { t, lang } = useI18n();
  return <div className="p-6"><StateMessage tone="danger" icon={<Link2Off className="size-4" aria-hidden />} title={t('contractError')}
    body={<><p>{contractErrorSentence(lang, contractError!)}</p><p className="t-mono mt-2 break-all">{url}</p></>}
    detail={contractError!.message}
    action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); resetContext(); }}>{t('resetContext')}</Button>} /></div>;
}

/** Registry-only menu: proves shell, permissions and Context transfer work before the screen exists. */
function capabilityLabel(cap: Capability, t: (key: 'applied' | 'referenceOnly' | 'notUsed') => string) {
  if (cap === 'apply') return t('applied');
  if (cap === 'reference') return t('referenceOnly');
  return t('notUsed');
}

function PlannedPage() {
  const { route, registry, global } = usePlatform();
  const { t, tx, lang } = useI18n();
  const menu = route!.menu;
  const keys = Object.keys(menu.context) as ContextKey[];
  const tone = { apply: 'success', reference: 'info', unsupported: 'neutral' } as const;
  const barVisible = contextBarVisible(menu.context, global);
  return <PlatformPage>
    <div className="grid gap-3 wide:grid-cols-[1fr_1fr]">
      <Panel title={t('plannedTitle')} subtitle={t('plannedBody')}>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-text-muted">{lang === 'ko' ? '그룹' : 'Group'}</dt><dd>{tx(registry.groupById(menu.group).label)}</dd>
          <dt className="text-text-muted">{t('pageType')}</dt><dd>{tx(PAGE_TYPE_LABELS[menu.pageType])}</dd>
        </dl>
      </Panel>
      <Panel title={t('capability')} subtitle={barVisible ? (lang === 'ko' ? '지원하지 않는 조건은 위 막대에 이 화면에서 미사용으로 표시됩니다.' : 'Conditions this page does not use stay on the bar above.') : undefined}>
        <ul className="grid grid-cols-2 gap-1.5 text-sm">
          {keys.map(k => <li key={k} className="flex items-center justify-between rounded-sm bg-surface-sunken px-2 py-1">
            <span>{tx(CONTEXT_LABELS[k])}</span><StatusBadge tone={tone[menu.context[k]]}>{capabilityLabel(menu.context[k], t)}</StatusBadge>
          </li>)}
        </ul>
      </Panel>
    </div>
  </PlatformPage>;
}
