import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, SavedViewStore } from '@ap/contracts';
import type { BootstrapResult, HttpAdapterOptions } from '@ap/http-adapter';
import { createRealAssembly, loginHref } from './http-assembly';

const where = { pathname: '/analytics/cycle-time', search: '?v=1&scopeId=MEM&from=2026-09-25T09:00:00' };
const adapter = { session: () => ({ user: { id: 'u1' } }) } as unknown as PlatformAdapter;
const store = { list: vi.fn(async () => []), getDefaultId: vi.fn(async () => null), save: vi.fn() } as unknown as SavedViewStore;
const importLocal = vi.fn();
const ready: BootstrapResult = { kind: 'ready', adapter, store, importLocal };
const empty = { importEnvironment: () => ({ storage: { length: 0, key: () => null, getItem: () => null, setItem: () => undefined }, locks: undefined }) };

function assemblyFor(result: BootstrapResult, extra: Partial<Parameters<typeof createRealAssembly>[0]> = empty) {
  const seen: HttpAdapterOptions[] = [];
  const create = createRealAssembly({ bootstrap: async options => { seen.push(options); return result; }, where: () => where, ...extra });
  return { create, seen };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('real assembly (#154)', () => {
  it('ready → the adapter, the server-backed SavedViewStore (ADR-0099) and the feature API, with no top-bar tools (ADR-0071)', async () => {
    const outcome = await assemblyFor(ready).create();
    // The adapter is decorated once (notice writes refresh Home, #1106): every other member is the bootstrap's own.
    expect(outcome).toEqual({ adapter: expect.objectContaining({ session: adapter.session }), topBarTools: null, serverPreferences: true, savedViews: expect.any(Object), featureApi: { basePath: '/api/features', onSessionLost: expect.any(Function) }, invalidation: { subscribe: expect.any(Function) } });
    // The wrapped real store is injected, not the browser-local simulation: its reads reach the HTTP store.
    const injected = (outcome as { savedViews: SavedViewStore }).savedViews;
    await injected.list({ userId: 'u1', menuId: null });
    expect(store.list).toHaveBeenCalledOnce();
    expect(injected.save).toBe(store.save);
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    (outcome as { featureApi: { onSessionLost: () => void } }).featureApi.onSessionLost();
    expect(replace).toHaveBeenCalledWith(loginHref(where));
  });

  it('offers the actor\'s local rows once and lets the first list wait for that attempt', async () => {
    const actor = 'u1';
    const data = new Map([[`platform:saved-views:v1:${JSON.stringify([1, actor, null])}`, JSON.stringify({ schemaVersion: 1, views: [{ id: 'u1||1', schemaVersion: 1, kind: 'condition-set', name: 'n', ownerId: actor, version: 1, updatedAt: 1, visibility: { kind: 'private' }, approval: 'none', context: {} }] })]]);
    const storage = { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const locks = { request: <T,>(_n: string, cb: () => Promise<T>) => cb() };
    const send = vi.fn(async (c: { rows: { legacyKey: string }[] }) => ({ ok: true as const, value: { defaults: [], results: c.rows.map(r => ({ legacyKey: r.legacyKey, status: 'imported' as const, id: 's' })) } }));
    const { create } = assemblyFor({ ...ready, importLocal: send as never }, { importEnvironment: () => ({ storage, locks }) });
    const outcome = await create();
    await (outcome as { savedViews: SavedViewStore }).savedViews.list({ userId: actor, menuId: null });
    expect(send).toHaveBeenCalledOnce();
    expect(store.list).toHaveBeenCalled();
    expect(data.get(`platform:saved-views:v1:${JSON.stringify([1, actor, null])}`)).toContain('"name":"n"');
  });

  it('login → redirect to /auth/login with return_to fully encoded (an unencoded & would cut the Context)', async () => {
    const outcome = await assemblyFor({ kind: 'login' }).create();
    expect(outcome).toEqual({ redirect: '/auth/login?return_to=%2Fanalytics%2Fcycle-time%3Fv%3D1%26scopeId%3DMEM%26from%3D2026-09-25T09%3A00%3A00' });
    const href = (outcome as { redirect: string }).redirect;
    expect(new URL(href, 'http://x').searchParams.get('return_to')).toBe(where.pathname + where.search);
  });

  it('unavailable → a static screen with the message, the correlation id and a retry button', async () => {
    const outcome = await assemblyFor({ kind: 'unavailable', correlationId: 'req-abc' }).create();
    expect('screen' in outcome).toBe(true);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render((outcome as { screen: React.ReactNode }).screen);
    expect(screen.getByText('서버에 연결할 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText('req-abc')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('onSessionLost → the same login redirect', async () => {
    const { create, seen } = assemblyFor(ready);
    await create();
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    seen[0]!.onSessionLost!();
    expect(replace).toHaveBeenCalledWith(loginHref(where));
  });
});
