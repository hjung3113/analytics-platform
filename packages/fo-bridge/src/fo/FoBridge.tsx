import { useMemo, useRef, useInsertionEffect, type ComponentType, type ReactNode } from 'react';
import { ServerOff } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { FoScreenRoot, type HostLinkProps, type HostNavigate, type HostNotice, type HostSearch, type HostSeam } from '@fops/frontend/global-screens/core';
import type { TargetOf } from './links';
import { isReachable } from './reachable';
import { foQueryClient, useFoSession } from './session';

/** The default seam links nothing (backlog: 알림 목적지 연결); `Link` is the unreachable fallback, and a screen passes `canLink`/`Link` for the targets it can reach. */
export function UnlinkedLink({ to: _to, children, ...rest }: HostLinkProps) {
  return <span {...rest}>{children}</span>;
}

/**
 * Hosts FeedbackOps screens. Without a FeedbackOps API (mock preview) nothing from FeedbackOps mounts and nothing is
 * requested. With one, the subtree renders only for the current (adapter, revision, user) generation and until a FeedbackOps 401 retires it: a change
 * unmounts the old subtree in that commit, clears the cache before the new one mounts, and remounts it (ADR-0071 decision 5).
 */
const noLink = () => false;
const noNavigate: HostNavigate = () => undefined;
const useNoNavigate = () => noNavigate;
const noSearch: HostSearch = {};
const useNoSearch = () => noSearch;
const useNoTitle = (_title: string | null) => undefined;
const useNoHere = () => '';

const TONE = { success: 'info', info: 'info', warning: 'warning', error: 'danger' } as const satisfies Record<HostNotice['tone'], 'info' | 'warning' | 'danger'>;

/** `useNavigate`/`useSearch`/`useTitle`/`useHere` must be module-level hooks (stable identities): the seam is memoized on them, so a URL change never rebuilds it. */
export function FoBridge({ children, canLink = noLink, Link = UnlinkedLink, targetOf, useNavigate = useNoNavigate, useSearch = useNoSearch, useTitle = useNoTitle, useHere = useNoHere }: { children: ReactNode; canLink?: HostSeam['canLink']; targetOf?: TargetOf; Link?: ComponentType<HostLinkProps>; useNavigate?: () => HostNavigate; useSearch?: () => HostSearch; useTitle?: (title: string | null) => void; useHere?: () => string }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { toast, dismissToast, registry, linkTo, absoluteUrl } = usePlatform();
  const session = useFoSession();
  // `linkTo`/`absoluteUrl` change with each navigation; the seam reads the latest through a ref so its identity stays stable.
  const latest = useRef({ linkTo, absoluteUrl });
  useInsertionEffect(() => { latest.current = { linkTo, absoluteUrl }; });

  const seam = useMemo<HostSeam>(() => ({
    // With `targetOf`, a path is linkable only when its menu is in this registry (`hostLinks` applies the same rule to `Link`).
    canLink: targetOf ? to => isReachable(registry, targetOf(to)) : canLink,
    ...(targetOf ? {
      absoluteHref: (to: string) => {
        const target = targetOf(to);
        return isReachable(registry, target) ? latest.current.absoluteUrl(latest.current.linkTo(target.menuId, { params: target.params, page: target.page })) : null;
      },
    } : {}),
    Link,
    notifyError: message => toast(message, 'danger'),
    notifySuccess: message => toast(message),
    useNavigate,
    useSearch,
    useTitle,
    // One look on the platform: `variant` is ignored, the action is the kernel toast's single button.
    notify: ({ tone, message, description, action, durationMs }) =>
      String(toast(message, TONE[tone], description, { ...(action ? { action } : {}), ...(durationMs !== undefined ? { durationMs } : {}) })),
    dismiss: id => dismissToast(Number(id)),
    useHere,
  }), [canLink, targetOf, registry, Link, toast, dismissToast, useNavigate, useSearch, useTitle, useHere]);

  if (session.status === 'no-api') {
    return <StateMessage icon={<ServerOff className="size-4" aria-hidden />}
      title={ko ? '실서버 필요' : 'Real server required'}
      body={ko ? '이 화면은 FeedbackOps 서버의 데이터를 씁니다. mock 미리보기에서는 열리지 않습니다.' : 'This screen reads FeedbackOps server data and does not open in the mock preview.'} />;
  }
  if (session.status === 'pending') return null;
  if (session.status === 'retired') {
    return <StateMessage icon={<ServerOff className="size-4" aria-hidden />}
      title={ko ? '세션이 만료되었습니다' : 'Your session has expired'}
      body={ko ? '로그인 화면으로 이동합니다.' : 'Redirecting to the sign-in page.'} />;
  }
  return <FoScreenRoot client={foQueryClient} host={seam} key={session.epoch}>{children}</FoScreenRoot>;
}
