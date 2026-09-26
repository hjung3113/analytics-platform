import { Ban, FileQuestion, Link2Off } from 'lucide-react';
import { useI18n } from './kernel/i18n';
import { PlatformLink, usePlatform } from './kernel/platform';
import { CONTEXT_LABELS, GROUPS, PAGE_TYPE_LABELS, type ContextKey } from './kernel/registry';
import { Panel, PlatformPage } from './platform/PlatformPage';
import { StateMessage } from './platform/StateView';
import { StatusBadge } from './platform/StatusBadge';
import { AppShell } from './shell/AppShell';
import { Button } from './ui/components/Button';

export function App() {
  return <AppShell><RouteOutlet /></AppShell>;
}

function RouteOutlet() {
  const { route, contractError, can, url } = usePlatform();
  const { t, lang } = useI18n();
  if (!route) return <KernelMessage icon={<FileQuestion className="size-4" aria-hidden />} title={t('notFound')} body={<span className="t-mono">{url}</span>} />;
  if (contractError) return <ContractErrorView />;
  // Direct URL to a menu hidden by permission: the server check still answers (§17), distinct from "no data".
  if (!can(route.menu.permission)) return <KernelMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={lang === 'ko' ? '이 메뉴에 대한 권한이 없습니다' : 'You do not have access to this menu'}
    body={<>{lang === 'ko' ? '내비게이션에서는 숨겨지며, 직접 URL 접근도 서버가 거부합니다.' : 'Hidden from navigation; direct URL access is rejected by the server.'} <span className="t-mono">permission={route.menu.permission}</span></>} />;
  const Page = route.menu.component;
  if (!Page) return <PlannedPage />;
  return <Page key={route.menu.id + JSON.stringify(route.params)} params={route.params} />;
}

function KernelMessage({ icon, title, body, tone }: { icon: React.ReactNode; title: string; body: React.ReactNode; tone?: 'warning' | 'danger' }) {
  const { linkTo } = usePlatform();
  const { t } = useI18n();
  return <div className="p-6"><StateMessage tone={tone} icon={icon} title={title} body={body}
    action={<Button asChild size="sm" variant="secondary"><PlatformLink href={linkTo('home')}>{t('home')}</PlatformLink></Button>} /></div>;
}

function ContractErrorView() {
  const { contractError, resetContext, url } = usePlatform();
  const { t } = useI18n();
  return <div className="p-6"><StateMessage tone="danger" icon={<Link2Off className="size-4" aria-hidden />} title={`${t('contractError')}: ${contractError!.code}`}
    body={<><p>{contractError!.message}</p><p className="mt-1">{t('contractErrorBody')}</p><p className="t-mono mt-2 break-all opacity-80">{url}</p></>}
    action={<Button size="sm" variant="secondary" onClick={resetContext}>{t('resetContext')}</Button>} /></div>;
}

/** Registry-only menu: proves shell, permissions and Context transfer work before the screen exists. */
function PlannedPage() {
  const { route } = usePlatform();
  const { t, tx, lang } = useI18n();
  const menu = route!.menu;
  const keys = Object.keys(menu.context) as ContextKey[];
  const tone = { apply: 'success', reference: 'info', unsupported: 'neutral' } as const;
  return <PlatformPage>
    <div className="grid gap-3 wide:grid-cols-[1fr_1fr]">
      <Panel title={t('plannedTitle')} subtitle={t('plannedBody')}>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-[13px]">
          <dt className="text-text-muted">id</dt><dd className="t-mono">{menu.id}</dd>
          <dt className="text-text-muted">{lang === 'ko' ? '그룹' : 'Group'}</dt><dd>{tx(GROUPS.find(g => g.id === menu.group)!.label)}</dd>
          <dt className="text-text-muted">{t('pageType')}</dt><dd>{tx(PAGE_TYPE_LABELS[menu.pageType])}</dd>
          <dt className="text-text-muted">path</dt><dd className="t-mono">{menu.path}</dd>
          <dt className="text-text-muted">permission</dt><dd className="t-mono">{menu.permission}</dd>
          <dt className="text-text-muted">requiresScope</dt><dd className="t-mono">{String(menu.requiresScope)}</dd>
        </dl>
      </Panel>
      <Panel title={t('capability')} subtitle={lang === 'ko' ? '지원하지 않는 Context도 URL에 보존되고 위 Context Bar에 “미사용”으로 표시됩니다.' : 'Unsupported context stays in the URL and shows as “not used” above.'}>
        <ul className="grid grid-cols-2 gap-1.5 text-[13px]">
          {keys.map(k => <li key={k} className="flex items-center justify-between rounded-sm bg-surface-sunken px-2 py-1">
            <span>{tx(CONTEXT_LABELS[k])}</span><StatusBadge tone={tone[menu.context[k]]}>{menu.context[k]}</StatusBadge>
          </li>)}
        </ul>
      </Panel>
    </div>
  </PlatformPage>;
}
