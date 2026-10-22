import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { ServerOff } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import type { PlatformAdapter } from '@ap/contracts';
import { configureApiClient, createFoQueryClient, FoScreenRoot, type HostLinkProps, type HostSeam } from '@fops/frontend/global-screens';
import { foApi } from '../fo-api';

/** One FeedbackOps QueryClient for the whole app (ADR-0071 decision 5); cleared whenever the session generation changes. */
export const foQueryClient = createFoQueryClient();
const client = foQueryClient;

type Generation = { adapter: PlatformAdapter; revision: number; userId: string | null };
type Ready = Generation & { epoch: number };

/** The generation the cache was last cleared for. Written only inside the layout effect below, never during render. */
let lastReady: Ready | null = null;

/** Epoch whose session was lost (any FeedbackOps 401). It stays retired, across page remounts too, until a new generation starts a new epoch. */
let retiredEpoch: number | null = null;

const sameGeneration = (a: Generation, b: Generation): boolean => a.adapter === b.adapter && a.revision === b.revision && a.userId === b.userId;

/** No FeedbackOps target has a platform destination yet (backlog: 알림 목적지 연결), so the seam never links; `Link` is the unreachable fallback. */
function UnlinkedLink({ to: _to, children, ...rest }: HostLinkProps) {
  return <span {...rest}>{children}</span>;
}

/**
 * Hosts FeedbackOps screens. Without a FeedbackOps API (mock preview) nothing from FeedbackOps mounts and nothing is
 * requested. With one, the subtree renders only for the current (adapter, revision, user) generation and until a FeedbackOps 401 retires it: a change
 * unmounts the old subtree in that commit, clears the cache before the new one mounts, and remounts it (ADR-0071 decision 5).
 */
export function FoBridge({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { adapter, revision, user, toast } = usePlatform();
  const api = foApi();
  const userId = user?.id ?? null;
  const [ready, setReady] = useState<Ready | null>(null);
  const [, setRetiredTick] = useState(0);

  useLayoutEffect(() => {
    if (api === null) return;
    const current: Generation = { adapter, revision, userId };
    if (lastReady === null || !sameGeneration(lastReady, current)) {
      client.clear();
      lastReady = { ...current, epoch: (lastReady?.epoch ?? 0) + 1 };
    }
    const epoch = lastReady.epoch;
    configureApiClient({
      basePath: api.basePath,
      onUnauthorized: () => {
        // Retire the subtree and the cache first: the host's login redirect can take a while, and the previous session's rows must not stay on screen.
        retiredEpoch = epoch;
        setRetiredTick(tick => tick + 1);
        client.clear();
        api.onSessionLost();
      },
    });
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
  if (ready.epoch === retiredEpoch) {
    return <StateMessage icon={<ServerOff className="size-4" aria-hidden />}
      title={ko ? '세션이 만료되었습니다' : 'Your session has expired'}
      body={ko ? '로그인 화면으로 이동합니다.' : 'Redirecting to the sign-in page.'} />;
  }
  return <FoScreenRoot client={client} host={seam} key={ready.epoch}>{children}</FoScreenRoot>;
}
