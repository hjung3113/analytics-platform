import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { z } from 'zod';

import { isRequestablePermissionState } from '../api/permission-request-progress';
import type { PermissionCheckResponse } from '../api/permission-reads';
import { ApiError, isPermissionDenied } from '../api/types';
import { usePermissionCheckBridge } from './usePermissionCheckBridge';

type ListDenialRequest = { capability: string; managedSystemId: string; pending?: boolean };
type ScopedListBlock = { state: 'blocked'; roleRequired: boolean; request: ListDenialRequest | null };
const systemIdSchema = z.string().uuid();

export type ScopedEmptyListPermission =
  | { state: 'unchecked' | 'allowed' }
  | { state: 'checking'; lastBlocked?: ScopedListBlock | undefined }
  | { state: 'error'; retry: () => void; lastBlocked?: ScopedListBlock | undefined }
  | ScopedListBlock;

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
  const block: ScopedListBlock | undefined = check.data?.decision.allow === false
    ? { state: 'blocked', ...classifyPermissionBlock(check.data, capability, systemId) }
    : undefined;
  // A recheck (window focus) keeps the last decision on screen until the new one lands.
  if (check.isFetching && !check.isSuccess) return { state: 'checking', lastBlocked: block };
  if (check.isError) return { state: 'error', retry: () => void check.refetch(), lastBlocked: block };
  if (!check.isSuccess) return { state: 'checking' };
  return block ?? { state: 'allowed' };
}

function classifyPermissionBlock(data: PermissionCheckResponse, capability: string, systemId: string) {
  const { state } = data;
  const roleRequired = data.decision.reason === 'role_required';
  const pending = state === 'pending_request';
  const request = !roleRequired && (pending || isRequestablePermissionState(state))
    ? { capability, managedSystemId: systemId, pending }
    : null;
  return { roleRequired, request };
}

type Drawer = {
  selectedId: string | null;
  /** Omit when the host's DetailDrawer closes itself via isInList. */
  close?: () => void;
  /** A later explicit selection may start an independently authorized detail read. */
  closeOn?: 'denial';
};

type ListIdentity = { keptSystemId: string | undefined; query: string | undefined };

export function focusListDenialCard(card: HTMLDivElement | null, options?: FocusOptions) {
  (card?.querySelector<HTMLElement>('a[href], button:not([disabled])') ?? card)?.focus(options);
}

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

  // A denial replaces the list controls; when it removed the control that held focus, focus lands
  // on the card instead of the page body. Focus that survives, or none before, stays put (#2677).
  const lastFocused = useRef<Element | null>(null);
  useEffect(() => {
    const record = (event: FocusEvent) => {
      lastFocused.current = event.target instanceof Element ? event.target : null;
    };
    // Focus that leaves a still-connected element was moved by the user, not by a removal.
    const release = (event: FocusEvent) => {
      const target = event.target;
      queueMicrotask(() => {
        if (target instanceof Element && target.isConnected && lastFocused.current === target) {
          lastFocused.current = null;
        }
      });
    };
    document.addEventListener('focusin', record);
    document.addEventListener('focusout', release);
    return () => {
      document.removeEventListener('focusin', record);
      document.removeEventListener('focusout', release);
    };
  }, []);
  useLayoutEffect(() => {
    if (!denied) return;
    const previous = lastFocused.current;
    lastFocused.current = null;
    if (previous && !previous.isConnected && document.activeElement === document.body) {
      focusListDenialCard(deniedRef.current);
    }
  }, [denied]);

  // The host can apply the selection's URL change in a later commit.
  useLayoutEffect(() => {
    const previous = pending.current;
    if (selectedId !== null || previous === null) return;
    pending.current = null;
    if (!denied || previous.list.keptSystemId !== keptSystemId || previous.list.query !== identity) return;
    if (document.activeElement === document.body) focusListDenialCard(deniedRef.current);
  }, [denied, identity, keptSystemId, selectedId]);

  return {
    kind, denied, roleRequired, permissionError, request, requestable, keptSystemId, deniedRef,
    isInList: denied ? false as const : undefined,
  };
}
