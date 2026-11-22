import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { z } from 'zod';

import { isRequestablePermissionState } from '../api/permission-request-progress';
import { ApiError, isPermissionDenied } from '../api/types';
import { usePermissionCheckBridge } from './usePermissionCheckBridge';

type ListDenialRequest = { capability: string; managedSystemId: string; pending?: boolean };
const systemIdSchema = z.string().uuid();

export type ScopedEmptyListPermission =
  | { state: 'unchecked' | 'checking' | 'allowed' }
  | { state: 'error'; retry: () => void }
  | { state: 'blocked'; roleRequired: boolean; request: ListDenialRequest | null };

export function listSystemId(managedSystemId: string | undefined) {
  return managedSystemId === 'all' ? undefined : managedSystemId;
}

export function concreteListSystemId(value: unknown): string | undefined {
  return systemIdSchema.safeParse(value).data;
}

export function isListForbidden(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 403;
}

export function listForbiddenHint(error: unknown) {
  if (!isPermissionDenied(error) || error.detail?.reason === 'role_required') return undefined;
  return error.envelope.requestable_permission;
}

export function listForbiddenRequest(hint: ReturnType<typeof listForbiddenHint>, checkedSystemId?: string): ListDenialRequest | undefined {
  if (!hint) return undefined;
  const managedSystemId = concreteListSystemId(hint.managed_system_id ?? checkedSystemId);
  if (managedSystemId === undefined) return undefined;
  return { capability: hint.permission, managedSystemId };
}

/** An empty scoped result can mean the server filtered out every row the actor cannot read. */
export function useScopedEmptyListPermission({
  capability,
  managedSystemId,
  empty,
}: {
  capability: string;
  managedSystemId: string | undefined;
  empty: boolean;
}): ScopedEmptyListPermission {
  const systemId = concreteListSystemId(managedSystemId);
  const enabled = empty && systemId !== undefined;
  const check = usePermissionCheckBridge({
    capability,
    ...(systemId === undefined ? {} : { managedSystemId: systemId }),
  }, {
    enabled,
    refetchOnWindowFocus: ({ state }) =>
      state.status === 'success' && state.fetchStatus !== 'fetching' && state.data?.decision.allow === false
        ? 'always'
        : true,
  });
  if (!empty || systemId === undefined) return { state: 'unchecked' };
  // A recheck (window focus) keeps the last decision on screen until the new one lands.
  if (check.isFetching && !check.isSuccess) return { state: 'checking' };
  if (check.isError) return { state: 'error', retry: () => void check.refetch() };
  if (!check.isSuccess) return { state: 'checking' };
  if (check.data.decision.allow) return { state: 'allowed' };

  const { state } = check.data;
  const roleRequired = check.data.decision.reason === 'role_required';
  const pending = state === 'pending_request';
  const request = !roleRequired && (pending || isRequestablePermissionState(state))
    ? { capability, managedSystemId: systemId, pending }
    : null;
  return { state: 'blocked', roleRequired, request };
}

type Drawer = {
  selectedId: string | null;
  /** Omit when the host's DetailDrawer closes itself via isInList. */
  close?: () => void;
  /** A later explicit selection may start an independently authorized detail read. */
  closeOn?: 'denial';
};

type ListIdentity = { keptSystemId: string | undefined; query: string | undefined };

/** Surface a confirmed list denial and return focus once its drawer has closed. */
export function useListDenial({
  error,
  forbidden = 'any-403',
  scopedPermission,
  managedSystemId,
  drawer,
  identity,
  onDenied,
}: {
  error: unknown;
  /** Preserve consumers that distinguish permission envelopes from other 403 errors. */
  forbidden?: 'any-403' | 'permission';
  scopedPermission?: ScopedEmptyListPermission;
  managedSystemId: string | undefined;
  drawer?: Drawer;
  /** A list-query identity, when changing the query must invalidate pending focus or rerun cleanup. */
  identity?: string | undefined;
  onDenied?: () => void;
}) {
  const keptSystemId = listSystemId(managedSystemId);
  const isForbidden = forbidden === 'permission' ? isPermissionDenied : isListForbidden;
  const permissionError = isForbidden(error) ? error : null;
  const scopedBlock = scopedPermission?.state === 'blocked' &&
    !(error instanceof ApiError && error.status === 401) ? scopedPermission : null;
  const roleRequired = permissionError
    ? permissionError.detail?.reason === 'role_required'
    : scopedBlock?.roleRequired === true;
  let kind: 'none' | 'forbidden' | 'scoped-empty' | 'role-required' = 'none';
  if (roleRequired) kind = 'role-required';
  else if (permissionError) kind = 'forbidden';
  else if (scopedBlock) kind = 'scoped-empty';
  const denied = kind !== 'none';

  const requestable = listForbiddenHint(permissionError);
  let request: ListDenialRequest | null | undefined;
  if (permissionError) request = listForbiddenRequest(requestable);
  else if (scopedBlock) {
    request = roleRequired ? null : scopedBlock.request;
  }

  const deniedRef = useRef<HTMLDivElement>(null);
  const activeDenial = useRef<ListIdentity | null>(null);
  const pending = useRef<{ selectedId: string; list: ListIdentity } | null>(null);
  const selectedId = drawer?.selectedId ?? null;
  const closeOn = drawer?.closeOn;
  const closeDrawer = useEffectEvent(() => drawer?.close?.());
  const handleDenial = useEffectEvent(() => onDenied?.());

  useEffect(() => {
    if (!denied) {
      activeDenial.current = null;
      pending.current = null;
      return;
    }
    const active = activeDenial.current;
    const newDenial = active === null || active.keptSystemId !== keptSystemId || active.query !== identity;
    const list = newDenial ? { keptSystemId, query: identity } : active;
    if (newDenial) {
      activeDenial.current = list;
      handleDenial();
    }
    if (selectedId === null) return;
    if (closeOn === 'denial' && !newDenial) return;
    const previous = pending.current;
    if (previous?.selectedId === selectedId && previous.list === list) return;
    pending.current = { selectedId, list };
    closeDrawer();
  }, [closeOn, denied, identity, keptSystemId, selectedId]);

  // The host can apply the selection's URL change in a later commit.
  useLayoutEffect(() => {
    const previous = pending.current;
    if (selectedId !== null || previous === null) return;
    pending.current = null;
    if (!denied || previous.list.keptSystemId !== keptSystemId || previous.list.query !== identity) return;
    const card = deniedRef.current;
    (card?.querySelector<HTMLElement>('a[href], button:not([disabled])') ?? card)?.focus();
  }, [denied, identity, keptSystemId, selectedId]);

  return {
    kind, denied, roleRequired, permissionError, request, requestable, keptSystemId, deniedRef,
    isInList: denied ? false as const : undefined,
  };
}
