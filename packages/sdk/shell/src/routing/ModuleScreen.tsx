import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyRound, ServerCrash, UserX } from 'lucide-react';
import { useI18n, type ModuleMenuEntry } from '@ap/kernel';
import { useModuleHost, type ModuleShellPorts } from '@ap/kernel/host';
import { DetailDrawer, PlatformPage, StateMessage, focusPageFallback } from '@ap/components';
import { Button } from '@ap/ui';
import type { ModuleStatus } from '@ap/contracts';

type Props = { entry: ModuleMenuEntry; params: Readonly<Record<string, string>> };

/**
 * Renders a module screen with `{ params, host }` (ADR-0053). The outer component owns the screen status and survives a
 * release; the ready instance below it owns the host. A non-ready status unmounts the instance — that is the release
 * (signal aborts, queries reject, subscriptions drop) — and Retry mounts a fresh one. RouteOutlet keys this by menu,
 * params and revision, so a screen, params or generation change also resets the status. The outer component draws the
 * platform page frame (head, Context bar, Scope gate) once around both branches, so a status change swaps only the body
 * (#804); arrival focus has one owner there, which lands on the registered `focusTarget` before the heading.
 */
export function ModuleScreen({ entry, params }: Props) {
  const [status, setStatus] = useState<ModuleStatus>('ready');
  const [instance, setInstance] = useState(0);
  const target = useRef<HTMLElement | null>(null);
  const registerTarget = useCallback((el: HTMLElement | null) => { target.current = el; }, []);
  const arrivalTarget = useCallback(() => target.current, []);
  return <PlatformPage arrivalTarget={arrivalTarget}>
    {status !== 'ready'
      ? <StatusView status={status} onRetry={() => { setStatus('ready'); setInstance(n => n + 1); }} />
      : <ReadyInstance key={instance} entry={entry} params={params} setStatus={setStatus} registerTarget={registerTarget} />}
  </PlatformPage>;
}

function ReadyInstance({ entry, params, setStatus, registerTarget }: Props & { setStatus: (next: ModuleStatus) => void; registerTarget: (el: HTMLElement | null) => void }) {
  const { lang } = useI18n();
  // A setter from an instance that was released (status change, Retry, key change, unmount) must change nothing.
  const [token] = useState(() => ({ alive: true }));
  useLayoutEffect(() => {
    token.alive = true;
    return () => { token.alive = false; };
  }, [token]);
  const [detail, setDetail] = useState<{ node: ReactNode; label: string } | null>(null);

  const ports = useMemo((): ModuleShellPorts => ({
    status: next => { if (token.alive && next !== 'ready') setStatus(next); },
    focusTarget: el => { if (token.alive) registerTarget(el instanceof HTMLElement ? el : null); },
    detail: {
      show: (node, label) => { if (token.alive) setDetail({ node: node as ReactNode, label }); },
      clear: () => { if (token.alive) setDetail(null); },
    },
  }), [token, setStatus, registerTarget]);
  const host = useModuleHost(entry, params, ports);
  const Screen = entry.moduleScreen;

  return <>
    <Screen params={params} host={host} />
    {detail && <DetailDrawer title={detail.label} onClose={() => setDetail(null)}
      tabs={[{ id: 'detail', label: lang === 'ko' ? '상세' : 'Detail', content: detail.node }]} />}
  </>;
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
