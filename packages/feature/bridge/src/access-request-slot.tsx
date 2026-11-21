import { lazy, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import type { PermissionRequestTarget, Text } from '@ap/contracts';
import { useI18n, usePlatform, type AccessRequestSlot, type AccessRequestState } from '@ap/kernel';
import { fetchPermissionRequestsMine, isRequestablePermissionState, meBridgeQueryOptions, meCanOpenGrantedScreen, managedSystemsCatalogQuery, permissionCheckQueryOptions, permissionRequestProgress, permissionRequestsMineAllKey, permissionRequestsMineKey } from '@ap/feature-screens/global-screens/core';
import { isPendingFor } from './feature/access-request-match';
import { isReachable } from './feature/reachable';
import { featureQueryClient, useFeatureSession } from './feature/session';

/** Where the user reads their requests: 내 활동 › 권한 요청 (`/permission-requests`). */
const STATUS_MENU_ID = 'permission-requests';

/** Kernel permissions the requester page cannot ask for. */
const NOT_REQUESTABLE_PERMISSIONS: ReadonlySet<string> = new Set(['console:access']);

/** How long a read may stay `checking` before the place says it could not check (a request with no answer must not hold the entry for ever). */
export const REQUEST_READ_LIMIT_MS = 8000;

/**
 * Why a scoped place's state is unknown (#1933): `checking` only while a fetch really runs, `error` once it failed and nothing re-runs it.
 * A place with no read (not enabled: mock or session not ready) and a read that is not running without having failed
 * (paused offline, cancelled) stay `undefined`: the plain entry, so the user is never held back by a read that is not happening.
 */
export function requestRead(input: { enabled: boolean; hasData: boolean; isError: boolean; fetchStatus: 'fetching' | 'paused' | 'idle' }): 'checking' | 'error' | undefined {
  if (!input.enabled) return undefined;
  if (input.isError) return input.fetchStatus === 'fetching' ? 'checking' : 'error';
  if (input.hasData) return undefined;
  return input.fetchStatus === 'fetching' ? 'checking' : undefined;
}

/** `checking` that lasts past the limit reads as `error` (with a retry); `attempt` restarts the clock after a retry. */
export function useCheckLimit(read: 'checking' | 'error' | undefined, attempt: number, limitMs: number = REQUEST_READ_LIMIT_MS): 'checking' | 'error' | undefined {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    if (read !== 'checking') return;
    const timer = setTimeout(() => setStalled(true), limitMs);
    return () => clearTimeout(timer);
  }, [read, attempt, limitMs]);
  return read === 'checking' && stalled ? 'error' : read;
}

function Pending({ target, children }: { target: PermissionRequestTarget; children: (state: AccessRequestState) => ReactNode }) {
  if (target.kind === 'permission') return <MenuPending permission={target.permission}>{children}</MenuPending>;
  return <ScopePending target={target}>{children}</ScopePending>;
}

function ScopePending({ target, children }: { target: Exclude<PermissionRequestTarget, { kind: 'permission' }>; children: (state: AccessRequestState) => ReactNode }) {
  const session = useFeatureSession();
  const { registry, resolveLink } = usePlatform();
  const enabled = session.status === 'ready';
  const { data, isError, fetchStatus, refetch } = useQuery({
    queryKey: permissionRequestsMineKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ signal }),
    enabled,
    // The home `내 할 일` observer of this key does not retry either.
    retry: false,
  }, featureQueryClient);
  const pending = enabled && !isError && data !== undefined ? isPendingFor(target, data.requests) : null;
  const link = isReachable(registry, { menuId: STATUS_MENU_ID }) ? resolveLink(STATUS_MENU_ID) : null;
  const [attempt, setAttempt] = useState(0);
  const read = useCheckLimit(requestRead({ enabled, hasData: data !== undefined, isError, fetchStatus }), attempt);
  const statusHref = link?.allowed ? link.href : null;
  const retry = () => { setAttempt(n => n + 1); void refetch(); };
  const state = { pending, statusHref };
  return <>{children(read === undefined ? state : read === 'checking' ? { ...state, read } : { ...state, read, retry })}</>;
}

function MenuPending({ permission, children }: { permission: string; children: (state: AccessRequestState) => ReactNode }) {
  const { registry, resolveLink, route } = usePlatform();
  const declaration = route?.menu.requiredCapability;
  if (permission === 'features:access' && declaration?.requestOnMenuDenial !== undefined) {
    return <CapabilityPending capability={declaration.id} copy={declaration.requestOnMenuDenial}>{children}</CapabilityPending>;
  }
  const link = permission !== 'features:access' && !NOT_REQUESTABLE_PERMISSIONS.has(permission)
    && isReachable(registry, { menuId: STATUS_MENU_ID }) ? resolveLink(STATUS_MENU_ID) : null;
  const href = link?.allowed ? link.href : null;
  return <>{children({ pending: null, statusHref: href, requestHref: href })}</>;
}

function CapabilityPending({ capability, copy, children }: {
  capability: string;
  copy: { label: Text; roleRequired: Text };
  children: (state: AccessRequestState) => ReactNode;
}) {
  const session = useFeatureSession();
  const { lang } = useI18n();
  const { registry, resolveLink, pageParam } = usePlatform();
  const ready = session.status === 'ready';
  const meOptions = meBridgeQueryOptions();
  const me = useQuery({ ...meOptions, enabled: ready, retry: false }, featureQueryClient);
  const enabled = ready && me.isSuccess && meCanOpenGrantedScreen(capability, me.data.actor.role_level);
  const managedSystem = pageParam('managedSystem');
  const systemsOptions = managedSystemsCatalogQuery();
  const systems = useQuery({ ...systemsOptions, enabled, retry: false }, featureQueryClient);
  const activeSystems = enabled ? systems.data?.items.filter(item => item.archived_at === null) ?? [] : [];
  const selected = activeSystems.find(item => item.id === managedSystem)
    ?? (managedSystem === null || managedSystem === 'all' ? activeSystems.find(item => item.external_key === 'platform') : undefined);
  const checkOptions = permissionCheckQueryOptions({ capability, ...(selected ? { managedSystemId: selected.id } : {}) });
  const checkEnabled = enabled && selected !== undefined;
  const check = useQuery({ ...checkOptions, enabled: checkEnabled }, featureQueryClient);
  const current = enabled && selected !== undefined && check.isSuccess && !check.isFetching && !check.data.decision.allow
    ? check.data.state
    : null;
  const pending = current === null ? null : current === 'pending_request';
  const requestable = isRequestablePermissionState(current);
  const mine = useQuery({
    queryKey: permissionRequestsMineAllKey,
    queryFn: ({ signal }) => fetchPermissionRequestsMine({ status: 'all', signal }),
    enabled: requestable,
    retry: false,
  }, featureQueryClient);
  const [attempt, setAttempt] = useState(0);
  const systemsRead = requestRead({ enabled, hasData: systems.data !== undefined, isError: systems.isError, fetchStatus: systems.fetchStatus });
  const permissionRead = requestRead({ enabled: checkEnabled, hasData: check.data !== undefined && !check.isFetching, isError: check.isError, fetchStatus: check.fetchStatus });
  const historyRead = requestRead({ enabled: requestable, hasData: mine.data !== undefined && !mine.isFetching, isError: mine.isError, fetchStatus: mine.fetchStatus });
  const roleRead = requestRead({ enabled: ready, hasData: me.data !== undefined, isError: me.isError, fetchStatus: me.fetchStatus });
  const reads = [roleRead, systemsRead, permissionRead, historyRead];
  const read = useCheckLimit(reads.includes('checking') ? 'checking' : reads.find(status => status === 'error'), attempt);
  const retry = () => {
    setAttempt(value => value + 1);
    const retryRead = (status: typeof read, queryKey: QueryKey, refetch: () => Promise<unknown>) => {
      if (status === undefined) return;
      // React Query reuses an in-flight first fetch until it is explicitly cancelled.
      if (status === 'checking') void featureQueryClient.cancelQueries({ queryKey, exact: true });
      void refetch();
    };
    retryRead(roleRead, meOptions.queryKey, me.refetch);
    retryRead(systemsRead, systemsOptions.queryKey, systems.refetch);
    retryRead(permissionRead, checkOptions.queryKey, check.refetch);
    retryRead(historyRead, permissionRequestsMineAllKey, mine.refetch);
  };
  const reachable = isReachable(registry, { menuId: STATUS_MENU_ID });
  const link = reachable ? resolveLink(STATUS_MENU_ID) : null;
  const statusHref = link?.allowed ? link.href : null;
  const missing = {
    permission: ready && me.isSuccess && !enabled ? copy.roleRequired[lang] : copy.label[lang],
    ...(selected ? { system: selected.name } : {}),
  };
  if (read !== undefined) {
    return <>{children({ pending: null, statusHref: null, missing, read, ...(read === 'error' ? { retry } : {}) })}</>;
  }
  const progress = requestable && mine.isSuccess ? permissionRequestProgress(
    mine.data.requests, capability, selected?.id, { pending: false },
  ) : 'none';
  const requestLink = requestable && mine.isSuccess && reachable ? resolveLink(STATUS_MENU_ID, {
    page: { capability, managedSystem: selected?.id ?? null },
    returnTo: true,
  }) : null;
  return <>{children({
    pending, statusHref: enabled ? statusHref : null, requestHref: requestLink?.allowed ? requestLink.href : null,
    approvedPartial: progress === 'approved-partial',
    missing,
  })}</>;
}

// The dialog page (and with it the feature request form) loads on the first open, so none of it is in the main chunk.
const AccessRequest = lazy(() => import('./pages/AccessRequest'));

/** The controlled request dialog. Mounted from the first open on (so its close animation and completion step stay), only in a ready session and only for a site or room place. */
function Dialog({ target, returnTo, open, onOpenChange, exactTarget }: ComponentProps<AccessRequestSlot['Dialog']>) {
  const session = useFeatureSession();
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  if (target.kind === 'permission' || session.status !== 'ready' || !opened) return null;
  return <Suspense fallback={null}><AccessRequest exactTarget={exactTarget} target={target} returnTo={returnTo} open={open} onOpenChange={onOpenChange} /></Suspense>;
}

/** The blocked-place request entry (Kernel `accessRequest`, ADR-0154 decision 6). Only `apps/platform-web/src/main.tsx` imports this; the app passes it only with a feature API. */
export const accessRequestSlot: AccessRequestSlot = { Pending, Dialog, supportsExactTarget: true };
