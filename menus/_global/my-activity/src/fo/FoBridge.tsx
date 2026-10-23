import { useMemo, type ComponentType, type ReactNode } from 'react';
import { ServerOff } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { FoScreenRoot, type HostLinkProps, type HostSeam } from '@fops/frontend/global-screens/core';
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
export function FoBridge({ children, canLink = () => false, Link = UnlinkedLink }: { children: ReactNode; canLink?: HostSeam['canLink']; Link?: ComponentType<HostLinkProps> }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { toast } = usePlatform();
  const session = useFoSession();

  const seam = useMemo<HostSeam>(() => ({
    canLink,
    Link,
    notifyError: message => toast(message, 'danger'),
  }), [canLink, Link, toast]);

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
