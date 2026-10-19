import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyRound, ServerCrash, UserX } from 'lucide-react';
import { useI18n, useModuleHost, usePlatform, type ModuleMenuEntry, type ModuleShellPorts } from '@ap/kernel';
import { StateMessage, focusPageFallback } from '@ap/components';
import { Button, useDetailPanelContent } from '@ap/ui';
import type { ModuleStatus } from '@ap/contracts';

type Props = { entry: ModuleMenuEntry; params: Readonly<Record<string, string>> };

/**
 * Renders a module screen with `{ params, host }` (ADR-0053). The outer component owns the screen status and survives a
 * release; the ready instance below it owns the host. A non-ready status unmounts the instance — that is the release
 * (signal aborts, queries reject, subscriptions drop) — and Retry mounts a fresh one. RouteOutlet keys this by menu,
 * params and revision, so a screen, params or generation change also resets the status.
 */
export function ModuleScreen({ entry, params }: Props) {
  const [status, setStatus] = useState<ModuleStatus>('ready');
  const [instance, setInstance] = useState(0);
  if (status !== 'ready') return <StatusView status={status} onRetry={() => { setStatus('ready'); setInstance(n => n + 1); }} />;
  return <ReadyInstance key={instance} entry={entry} params={params} setStatus={setStatus} />;
}

function ReadyInstance({ entry, params, setStatus }: Props & { setStatus: (next: ModuleStatus) => void }) {
  const { pageNavigation, pathname, url } = usePlatform();
  // A setter from an instance that was released (status change, Retry, key change, unmount) must change nothing.
  const [token] = useState(() => ({ alive: true }));
  useLayoutEffect(() => {
    token.alive = true;
    return () => { token.alive = false; };
  }, [token]);
  const [detail, setDetail] = useState<{ node: ReactNode; label: string } | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const ports = useMemo((): ModuleShellPorts => ({
    status: next => { if (token.alive && next !== 'ready') setStatus(next); },
    focusTarget: el => { if (token.alive) target.current = el instanceof HTMLElement ? el : null; },
    detail: {
      show: (node, label) => { if (token.alive) setDetail({ node: node as ReactNode, label }); },
      clear: () => { if (token.alive) setDetail(null); },
    },
  }), [token, setStatus]);
  const host = useModuleHost(entry, params, ports);
  const Screen = entry.moduleScreen;
  useDetailPanelContent(detail === null ? undefined : <section aria-label={detail.label} className="contents">{detail.node}</section>);

  // Arrival focus (06 §26, ADR-0032), the same consume the page header does: the registered target, else main.
  const arrive = useCallback(() => {
    if (!pageNavigation.consume(pathname)) return;
    if (target.current?.isConnected) target.current.focus({ preventScroll: true });
    else focusPageFallback(wrapper.current);
  }, [pageNavigation, pathname]);
  useLayoutEffect(() => {
    arrive();
    // A palette or switcher keeps a page request pending until it closes; the release notifies here.
    return pageNavigation.subscribe(arrive);
  }, [arrive, pageNavigation, url]);

  return <div ref={wrapper} className="contents"><Screen params={params} host={host} /></div>;
}

function StatusView({ status, onRetry }: { status: Exclude<ModuleStatus, 'ready'>; onRetry: () => void }) {
  const { t, lang } = useI18n();
  const ko = lang === 'ko';
  const view = {
    auth_required: { icon: <KeyRound className="size-4" aria-hidden />, title: ko ? '다시 로그인이 필요합니다' : 'Sign-in required' },
    identity_mismatch: { icon: <UserX className="size-4" aria-hidden />, title: ko ? '로그인한 사용자가 다릅니다' : 'Signed-in user does not match' },
    unavailable: { icon: <ServerCrash className="size-4" aria-hidden />, title: ko ? '지금 이 화면을 열 수 없습니다' : 'This screen is unavailable right now' },
  }[status];
  return <div className="p-6"><StateMessage tone="warning" icon={view.icon} title={view.title}
    action={<Button size="sm" variant="secondary" onClick={event => { focusPageFallback(event.currentTarget); onRetry(); }}>{t('retry')}</Button>} /></div>;
}
