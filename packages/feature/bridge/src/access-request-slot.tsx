import { lazy, Suspense, useState, type ComponentProps, type ReactNode } from 'react';
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
  const read = requestRead({ enabled, hasData: data !== undefined, isError, fetchStatus });
  const statusHref = link?.allowed ? link.href : null;
  const retry = () => {
    if (read === 'checking') void featureQueryClient.cancelQueries({ queryKey: permissionRequestsMineKey, exact: true });
    void refetch();
  };
  const readKey = JSON.stringify([session.status === 'ready' ? session.epoch : null, target]);
  return <>{children({ pending, statusHref, readKey, ...(read === undefined ? {} : { read, retry }) })}</>;
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

/**
 * The read deadline's System identity (#2685): it follows the route's `managedSystem` from the first paint, because the
 * catalog-selected System only exists once the catalog arrives, and keying on it restarted the cap when a slow catalog came
 * in and could not tell A from B while it was missing. A route change starts a new generation unless both values name the
 * Platform System (omitted, `all`, or its id once the catalog knows it), which the permission check reads as one target.
 */
function useRouteSystemGeneration(managedSystem: string | null, platformId: string | undefined): number {
  const [generation, setGeneration] = useState({ route: managedSystem, count: 0 });
  if (generation.route !== managedSystem) {
    const platform = (value: string | null) => value === null || value === 'all' || (platformId !== undefined && value === platformId);
    setGeneration({ route: managedSystem, count: platform(generation.route) && platform(managedSystem) ? generation.count : generation.count + 1 });
  }
  return generation.count;
}

function CapabilityPending({ capability, copy, children }: {
  capability: string;
  copy: { label: Text; roleRequired: Text };
  children: (state: AccessRequestState) => ReactNode;
}) {
  const session = useFeatureSession();
  const { lang } = useI18n();
  const { registry, resolveLink, pageParam, route } = usePlatform();
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
  const systemsRead = requestRead({ enabled, hasData: systems.data !== undefined, isError: systems.isError, fetchStatus: systems.fetchStatus });
  const permissionRead = requestRead({ enabled: checkEnabled, hasData: check.data !== undefined && !check.isFetching, isError: check.isError, fetchStatus: check.fetchStatus });
  const historyRead = requestRead({ enabled: requestable, hasData: mine.data !== undefined && !mine.isFetching, isError: mine.isError, fetchStatus: mine.fetchStatus });
  const roleRead = requestRead({ enabled: ready, hasData: me.data !== undefined, isError: me.isError, fetchStatus: me.fetchStatus });
  const reads = [roleRead, systemsRead, permissionRead, historyRead];
  const read = reads.includes('checking') ? 'checking' : reads.find(status => status === 'error');
  const routeTarget = useRouteSystemGeneration(managedSystem, activeSystems.find(item => item.external_key === 'platform')?.id);
  const readKey = JSON.stringify([session.status === 'ready' ? session.epoch : null, route?.menu.id, capability, routeTarget]);
  const retry = () => {
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
    return <>{children({ pending: null, statusHref: null, missing, read, readKey, retry })}</>;
  }
  const progress = requestable && mine.isSuccess ? permissionRequestProgress(
    mine.data.requests, capability, selected?.id, { pending: false },
  ) : 'none';
  const requestLink = requestable && mine.isSuccess && reachable ? resolveLink(STATUS_MENU_ID, {
    page: { capability, managedSystem: selected?.id ?? null },
    returnTo: true,
  }) : null;
  return <>{children({
    pending, readKey, statusHref: enabled ? statusHref : null, requestHref: requestLink?.allowed ? requestLink.href : null,
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
