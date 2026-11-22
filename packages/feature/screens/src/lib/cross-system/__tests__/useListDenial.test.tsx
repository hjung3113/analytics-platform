import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/types';
import { type ScopedEmptyListPermission, useListDenial, useScopedEmptyListPermission } from '../useListDenial';

const SYSTEM = 'aaaaaaaa-0000-4000-8000-000000000001';
const REQUEST = { capability: 'finding.read', managedSystemId: SYSTEM, pending: false };
const unchecked: ScopedEmptyListPermission = { state: 'unchecked' };
const blocked: ScopedEmptyListPermission = { state: 'blocked', roleRequired: false, request: REQUEST };
const requestable = { permission: 'finding.read', managed_system_id: SYSTEM };
type DrawerProps = { selectedId: string | null; scopedPermission: ScopedEmptyListPermission };

describe('useListDenial', () => {
  it.each([undefined, null, 'all', 'not-a-uuid'])('keeps the raw hint but offers no request for target %s', (target) => {
    const hint = { permission: 'finding.read', ...(target === undefined ? {} : { managed_system_id: target }) };
    // The HTTP response can contain null even though the envelope type omits it.
    const error = new ApiError(403, {
      code: 'permission.scope_required',
      message: 'denied',
      requestable_permission: hint as NonNullable<ApiError['envelope']['requestable_permission']>,
    });
    const { result } = renderHook(() => useListDenial({ error, managedSystemId: SYSTEM }));
    expect(result.current.requestable).toEqual(hint);
    expect(result.current.request).toBeUndefined();
  });

  it.each([
    { name: 'confirmed scoped empty', error: null, scopedPermission: blocked, kind: 'scoped-empty', request: REQUEST },
    {
      name: 'permission 403',
      error: new ApiError(403, { code: 'permission.scope_required', message: 'denied', requestable_permission: requestable }),
      scopedPermission: blocked,
      kind: 'forbidden',
      request: { capability: 'finding.read', managedSystemId: SYSTEM },
    },
    {
      name: 'role-required 403',
      error: new ApiError(403, {
        code: 'permission.denied', message: 'denied', detail: { reason: 'role_required' }, requestable_permission: requestable,
      }),
      scopedPermission: blocked,
      kind: 'role-required',
      request: undefined,
    },
    {
      name: 'role-required scoped empty',
      error: null,
      scopedPermission: { ...blocked, roleRequired: true },
      kind: 'role-required',
      request: null,
    },
    {
      name: 'unclassified 403',
      error: new ApiError(403, { code: 'internal.unexpected', message: 'denied' }),
      scopedPermission: unchecked,
      kind: 'forbidden',
      request: undefined,
    },
    { name: 'unconfirmed empty', error: null, scopedPermission: { state: 'checking' } as const, kind: 'none', request: undefined },
    {
      name: 'session loss',
      error: new ApiError(401, { code: 'permission.denied', message: 'denied' }),
      scopedPermission: blocked,
      kind: 'none',
      request: undefined,
    },
  ])('classifies $name and keeps the selected System', ({ error, scopedPermission, kind, request }) => {
    const { result } = renderHook(() => useListDenial({ error, scopedPermission, managedSystemId: SYSTEM }));
    expect(result.current).toMatchObject({ kind, request, keptSystemId: SYSTEM });
  });

  it.each(['controlled', 'drawer-owned'] as const)(
    'returns focus to the first available action after a %s drawer closes',
    (owner) => {
      const close = vi.fn();
      const card = document.createElement('div');
      card.tabIndex = -1;
      const disabled = document.createElement('button');
      disabled.disabled = true;
      const action = document.createElement('button');
      card.append(disabled, action);
      document.body.append(card);

      try {
        const initialProps: DrawerProps = { selectedId: 'record', scopedPermission: unchecked };
        const { result, rerender } = renderHook(
          ({ selectedId, scopedPermission }) =>
            useListDenial({
              error: null,
              scopedPermission,
              managedSystemId: SYSTEM,
              drawer: { selectedId, ...(owner === 'controlled' ? { close } : {}) },
            }),
          { initialProps },
        );
        result.current.deniedRef.current = card;
        expect(result.current.isInList).toBeUndefined();
        expect(close).not.toHaveBeenCalled();

        rerender({ selectedId: 'record', scopedPermission: blocked });
        expect(result.current.isInList).toBe(false);
        expect(close).toHaveBeenCalledTimes(owner === 'controlled' ? 1 : 0);
        expect(action).not.toHaveFocus();

        rerender({ selectedId: null, scopedPermission: blocked });
        expect(action).toHaveFocus();
      } finally {
        card.remove();
      }
    },
  );

  it('does not move focus for an old scope when its selection clears', () => {
    const card = document.createElement('div');
    card.tabIndex = -1;
    document.body.append(card);
    try {
      const initialProps: { managedSystemId: string; selectedId: string | null } = {
        managedSystemId: SYSTEM,
        selectedId: 'record',
      };
      const { result, rerender } = renderHook(
        ({ managedSystemId, selectedId }) =>
          useListDenial({ error: null, scopedPermission: blocked, managedSystemId, drawer: { selectedId } }),
        { initialProps },
      );
      result.current.deniedRef.current = card;
      rerender({ managedSystemId: 'all', selectedId: null });
      expect(card).not.toHaveFocus();
    } finally {
      card.remove();
    }
  });

  it('evicts before closing on each denial identity and permits an explicit reopen', () => {
    const actions: string[] = [];
    const initialProps: { identity: string; selectedId: string | null } = { identity: 'first', selectedId: 'record' };
    const { rerender } = renderHook(({ identity, selectedId }) => useListDenial({
      error: null,
      scopedPermission: blocked,
      managedSystemId: SYSTEM,
      identity,
      onDenied: () => actions.push(`evict:${identity}`),
      drawer: { selectedId, close: () => actions.push(`close:${selectedId}`), closeOn: 'denial' },
    }), { initialProps });

    expect(actions).toEqual(['evict:first', 'close:record']);
    rerender({ identity: 'first', selectedId: null });
    rerender({ identity: 'first', selectedId: 'reopened' });
    expect(actions).toEqual(['evict:first', 'close:record']);

    rerender({ identity: 'second', selectedId: 'reopened' });
    expect(actions).toEqual(['evict:first', 'close:record', 'evict:second', 'close:reopened']);
  });
});

describe('useListDenial focus on a removed control (#2677)', () => {
  const forbidden = new ApiError(403, { code: 'permission.denied', message: 'denied' });
  function Screen({ error }: { error: unknown }) {
    const { denied, deniedRef } = useListDenial({ error, managedSystemId: SYSTEM });
    return (
      <>
        <button type="button">outside</button>
        {denied ? (
          <div ref={deniedRef} tabIndex={-1} data-testid="card">
            <button type="button">권한 요청</button>
          </div>
        ) : (
          <input aria-label="search" />
        )}
      </>
    );
  }

  it('moves focus to the card when the denial removes the focused list control', () => {
    const { rerender } = render(<Screen error={null} />);
    screen.getByRole('textbox', { name: 'search' }).focus();
    rerender(<Screen error={forbidden} />);
    expect(screen.getByRole('button', { name: '권한 요청' })).toHaveFocus();
  });

  it('does not take focus when focus had already left the removed control (R-2677e C2)', async () => {
    const { rerender } = render(<Screen error={null} />);
    const search = screen.getByRole('textbox', { name: 'search' });
    search.focus();
    search.blur();
    await Promise.resolve();
    expect(document.activeElement).toBe(document.body);
    rerender(<Screen error={forbidden} />);
    expect(screen.getByRole('button', { name: '권한 요청' })).not.toHaveFocus();
  });

  it('leaves focus that survives the denial and does not take focus on a first denied render', () => {
    const { rerender } = render(<Screen error={null} />);
    screen.getByRole('button', { name: 'outside' }).focus();
    rerender(<Screen error={forbidden} />);
    expect(screen.getByRole('button', { name: 'outside' })).toHaveFocus();

    const first = render(<Screen error={forbidden} />);
    expect(first.getAllByRole('button', { name: '권한 요청' }).at(-1)).not.toHaveFocus();
  });
});

describe('useScopedEmptyListPermission', () => {
  afterEach(() => vi.unstubAllGlobals());

  function setupCheck() {
    const fetchCheck = vi.fn(async (_input: RequestInfo | URL) => Response.json({
      state: 'request_access',
      decision: { allow: false, reason: 'role_required', requestable: [{ managed_system_id: SYSTEM }] },
    }));
    vi.stubGlobal('fetch', fetchCheck);
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { fetchCheck, wrapper };
  }

  it('classifies a scoped empty list from the server role decision and suppresses its request', async () => {
    const { fetchCheck, wrapper } = setupCheck();
    const { result } = renderHook(() => {
      const scopedPermission = useScopedEmptyListPermission({ capability: 'finding.read', managedSystemId: SYSTEM, empty: true });
      return useListDenial({ error: null, managedSystemId: SYSTEM, scopedPermission });
    }, { wrapper });

    await waitFor(() => expect(result.current).toMatchObject({ kind: 'role-required', request: null }));
    expect(String(fetchCheck.mock.calls[0]?.[0])).toContain(`managed_system_id=${SYSTEM}`);
  });

  it.each(['all', 'not-a-uuid'])('does not point-check an empty result for %s', (managedSystemId) => {
    const { fetchCheck, wrapper } = setupCheck();
    const { result } = renderHook(() => useScopedEmptyListPermission({ capability: 'finding.read', managedSystemId, empty: true }), { wrapper });
    expect(result.current).toEqual({ state: 'unchecked' });
    expect(fetchCheck).not.toHaveBeenCalled();
  });
});
