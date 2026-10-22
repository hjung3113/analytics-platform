import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { ServerOff } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import type { PlatformAdapter } from '@ap/contracts';
import { configureApiClient, createFoQueryClient, FoScreenRoot, type HostLinkProps, type HostSeam } from '@fops/frontend/global-screens';
import { foApi } from '../fo-api';

/** One FeedbackOps QueryClient for the whole app (ADR-0071 decision 5); cleared whenever the session generation changes. */
const client = createFoQueryClient();

type Generation = { adapter: PlatformAdapter; revision: number; userId: string | null };
type Ready = Generation & { epoch: number };

/** The generation the cache was last cleared for. Written only inside the layout effect below, never during render. */
let lastReady: Ready | null = null;

const sameGeneration = (a: Generation, b: Generation): boolean => a.adapter === b.adapter && a.revision === b.revision && a.userId === b.userId;

/** No FeedbackOps target has a platform destination yet (backlog: 알림 목적지 연결), so the seam never links; `Link` is the unreachable fallback. */
function UnlinkedLink({ to: _to, children, ...rest }: HostLinkProps) {
  return <span {...rest}>{children}</span>;
}

/**
 * Hosts FeedbackOps screens. Without a FeedbackOps API (mock preview) nothing from FeedbackOps mounts and nothing is
 * requested. With one, the subtree renders only for the current (adapter, revision, user) generation: a change
 * unmounts the old subtree in that commit, clears the cache before the new one mounts, and remounts it (ADR-0071 decision 5).
 */
export function FoBridge({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, revision, user, toast } = usePlatform();
  const api = foApi();
  const userId = user?.id ?? null;
  const [ready, setReady] = useState<Ready | null>(null);

  useLayoutEffect(() => {
    if (api === null) return;
    const current: Generation = { adapter, revision, userId };
    if (lastReady === null || !sameGeneration(lastReady, current)) {
      client.clear();
      lastReady = { ...current, epoch: (lastReady?.epoch ?? 0) + 1 };
    }
    configureApiClient({ basePath: api.basePath, onUnauthorized: api.onSessionLost });
    setReady(lastReady);
  }, [api, adapter, revision, userId]);

  const seam = useMemo<HostSeam>(() => ({
    canLink: () => false,
    Link: UnlinkedLink,
    notifyError: message => toast(message, 'danger'),
  }), [toast]);

  if (api === null) {
    return <StateMessage icon={<ServerOff className="size-4" aria-hidden />}
      title={ko ? '실서버 필요' : 'Real server required'}
      body={ko ? '이 화면은 FeedbackOps 서버의 데이터를 씁니다. mock 미리보기에서는 열리지 않습니다.' : 'This screen reads FeedbackOps server data and does not open in the mock preview.'} />;
  }
  if (ready === null || !sameGeneration(ready, { adapter, revision, userId })) return null;
  return <FoScreenRoot client={client} host={seam} key={ready.epoch}>{children}</FoScreenRoot>;
}
