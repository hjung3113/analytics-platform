import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PermissionRequestTarget } from '@ap/contracts';
import { usePlatform, type AccessRequestSlot, type AccessRequestState } from '@ap/kernel';
import { fetchPermissionRequestsMine, permissionRequestsMineKey } from '@ap/feature-screens/global-screens/core';
import { isPendingFor } from './feature/access-request-match';
import { isReachable } from './feature/reachable';
import { featureQueryClient, useFeatureSession } from './feature/session';

/** Where the user reads their requests: 내 활동 › 권한 요청 (`/permission-requests`). */
const STATUS_MENU_ID = 'permission-requests';

/**
 * The place's request state from the user's own open requests (`GET /permission-requests/mine`). One `useQuery` on the shared feature
 * QueryClient under `permissionRequestsMineKey`, the key the home `내 할 일` reads and the request dialog invalidates on submit, so a submit
 * flips every place without a reload. `pending` is null in mock, before the session is ready, while loading, after an error and for a
 * `permission` place (no mapping yet, node 1844f1c); while loading `read` is `checking` and after an error it is `error` with `retry` (#1933); `statusHref` is the requester page for every place kind. `children` is called at one stable position in every state.
 */
/** Kernel permissions the requester page cannot ask for. */
const NOT_REQUESTABLE_PERMISSIONS: ReadonlySet<string> = new Set(['console:access']);

/**
 * Why a scoped place's state is unknown (#1933): `checking` only while the read really runs (or waits to run), `error` once it failed and nothing
 * re-runs it. A place with no read (not enabled: mock, session not ready, `permission` place) stays `undefined`, the plain entry as before.
 */
export function requestRead(input: { enabled: boolean; hasData: boolean; isError: boolean; isFetching: boolean }): 'checking' | 'error' | undefined {
  if (!input.enabled) return undefined;
  if (input.isFetching && !input.isError) return input.hasData ? undefined : 'checking';
  if (input.isError) return input.isFetching ? 'checking' : 'error';
  return input.hasData ? undefined : 'checking';
}

function Pending({ target, children }: { target: PermissionRequestTarget; children: (state: AccessRequestState) => ReactNode }) {
  const session = useFeatureSession();
  const { registry, resolveLink } = usePlatform();
  const scoped = target.kind !== 'permission';
  const enabled = scoped && session.status === 'ready';
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: permissionRequestsMineKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ signal }),
    enabled,
    // The home `내 할 일` observer of this key does not retry either.
    retry: false,
  }, featureQueryClient);
  const pending = enabled && !isError && data !== undefined ? isPendingFor(target, data.requests) : null;
  // A `permission` place has no pending read, but it still gets the requester page: that is where the user asks for the missing capability (#1940).
  // `console:access` is the workspace-admin permission, which the requester page does not offer (supported-scope policy), so that denial gets no link rather than a dead end.
  const requestable = target.kind !== 'permission' || !NOT_REQUESTABLE_PERMISSIONS.has(target.permission);
  const link = requestable && isReachable(registry, { menuId: STATUS_MENU_ID }) ? resolveLink(STATUS_MENU_ID) : null;
  const read = requestRead({ enabled, hasData: data !== undefined, isError, isFetching });
  const statusHref = link?.allowed ? link.href : null;
  return <>{children(read === undefined ? { pending, statusHref } : read === 'checking' ? { pending, statusHref, read } : { pending, statusHref, read, retry: () => { void refetch(); } })}</>;
}

// The dialog page (and with it the feature request form) loads on the first open, so none of it is in the main chunk.
const AccessRequest = lazy(() => import('./pages/AccessRequest'));

/** The controlled request dialog. Mounted from the first open on (so its close animation and completion step stay), only in a ready session and only for a site or room place. */
function Dialog({ target, returnTo, open, onOpenChange }: { target: PermissionRequestTarget; returnTo: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useFeatureSession();
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  if (target.kind === 'permission' || session.status !== 'ready' || !opened) return null;
  return <Suspense fallback={null}><AccessRequest target={target} returnTo={returnTo} open={open} onOpenChange={onOpenChange} /></Suspense>;
}

/** The blocked-place request entry (Kernel `accessRequest`, ADR-0154 decision 6). Only `apps/platform-web/src/main.tsx` imports this; the app passes it only with a feature API. */
export const accessRequestSlot: AccessRequestSlot = { Pending, Dialog };
