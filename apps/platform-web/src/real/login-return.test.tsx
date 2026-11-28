import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@ap/contracts';
import { createRealAssembly, loginHref, LOGIN_RETURN_TO_LIMIT } from './http-assembly';
import { LOGIN_RETURN_KEY, LOGIN_RETURN_MAX_AGE_MS, isSafeLoginReturn, restoreLoginReturn } from './login-return';

// The app boundary forbids server imports, even in tests. Execute the dependency-free sanitizer's source only here.
const serverSource = readFileSync('../platform-api/src/modules/auth/return-to.ts', 'utf8');
const serverExports: { sanitizeReturnTo?: (raw: string) => string } = {};
runInNewContext(transpileModule(serverSource, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText, { exports: serverExports, URL });
const sanitizeReturnTo = serverExports.sanitizeReturnTo!;

const notify = vi.hoisted(() => vi.fn());
vi.mock('@ap/kernel', async original => ({ ...await original<typeof import('@ap/kernel')>(), usePlatform: () => ({ toast: notify }) }));

const path = '/analytics/cycle-time';
const search = `?conditions=${'a'.repeat(2200)}`;
const ready = { kind: 'ready' as const, adapter: { session: () => ({ user: { id: 'u1' } }) } as unknown as PlatformAdapter, store: {} as never, importLocal: vi.fn() };
const record = (overrides = {}) => JSON.stringify({ path, search, savedAt: Date.now(), ...overrides });
const boot = () => createRealAssembly({ bootstrap: async () => ready, where: () => window.location, importEnvironment: () => ({ storage: { length: 0, key: () => null, getItem: () => null, setItem: () => undefined }, locks: undefined }) })();

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  notify.mockClear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('one-time login return (#2195)', () => {
  it('pins the browser limit to the unchanged server literal', () => {
    expect(LOGIN_RETURN_TO_LIMIT).toBe(Number(serverSource.match(/raw.length > (\d+)/)![1]));
  });

  it('long login URLs save conditions in this tab and send only the path', () => {
    const before = Date.now();
    expect(loginHref({ pathname: path, search })).toBe(`/auth/login?return_to=${encodeURIComponent(path)}`);
    expect(JSON.parse(sessionStorage.getItem(LOGIN_RETURN_KEY)!)).toEqual({ path, search, savedAt: expect.any(Number) });
    expect(JSON.parse(sessionStorage.getItem(LOGIN_RETURN_KEY)!).savedAt).toBeGreaterThanOrEqual(before);
  });

  it.each([0, 1])('keeps short URLs encoded exactly through the server boundary (%s)', extra => {
    const short = `?q=${'a'.repeat(LOGIN_RETURN_TO_LIMIT - path.length - 3 - extra)}`;
    expect(loginHref({ pathname: path, search: short })).toBe(`/auth/login?return_to=${encodeURIComponent(path + short)}`);
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
  });


  it('the anonymous bootstrap caller saves a long address for path-only login', async () => {
    history.replaceState(null, '', path + search);
    const outcome = await createRealAssembly({ bootstrap: async () => ({ kind: 'login' }), where: () => location })();
    expect(outcome).toEqual({ redirect: `/auth/login?return_to=${encodeURIComponent(path)}` });
    expect(JSON.parse(sessionStorage.getItem(LOGIN_RETURN_KEY)!)).toMatchObject({ path, search });
  });

  it('the session-loss caller saves the current long address, not the boot address', async () => {
    const replace = vi.fn();
    let loseSession: (() => void) | undefined;
    await createRealAssembly({ bootstrap: async options => { loseSession = options.onSessionLost; return ready; }, where: () => location, importEnvironment: () => ({ storage: { length: 0, key: () => null, getItem: () => null, setItem: () => undefined }, locks: undefined }) })();
    history.replaceState(null, '', path + search);
    vi.stubGlobal('location', { pathname: path, search, replace });
    loseSession!();
    expect(replace).toHaveBeenCalledWith(`/auth/login?return_to=${encodeURIComponent(path)}`);
    expect(JSON.parse(sessionStorage.getItem(LOGIN_RETURN_KEY)!)).toMatchObject({ path, search });
    vi.unstubAllGlobals();
  });

  it.each(['anonymous bootstrap', 'session loss'])('warns before %s navigation when saving fails, even if the next boot has readable-empty storage', async entry => {
    const replace = vi.fn();
    let loseSession: (() => void) | undefined;
    const assemble = createRealAssembly({
      bootstrap: async options => { loseSession = options.onSessionLost; return entry === 'anonymous bootstrap' ? { kind: 'login' } : ready; },
      where: () => ({ pathname: path, search }),
      importEnvironment: () => ({ storage: { length: 0, key: () => null, getItem: () => null, setItem: () => undefined }, locks: undefined }),
    });
    if (entry === 'session loss') await assemble();
    const write = vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem').mockImplementation(() => { throw new Error('quota'); });
    vi.stubGlobal('location', { pathname: path, search, replace });
    let redirected: string | undefined;
    let navigation: Promise<unknown> | undefined;
    await act(async () => {
      if (entry === 'anonymous bootstrap') navigation = assemble().then(outcome => { if ('redirect' in outcome) redirected = outcome.redirect; });
      else loseSession!();
    });
    expect(redirected).toBeUndefined();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('조회 조건을 저장하지 못했습니다. 로그인 후에는 이전 조회 조건이 복원되지 않습니다.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '로그인 계속' })); });
    await navigation;
    const fallback = `/auth/login?return_to=${encodeURIComponent(path + search)}`;
    if (entry === 'anonymous bootstrap') expect(redirected).toBe(fallback);
    else await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(fallback));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    write.mockRestore();
    vi.unstubAllGlobals();
    history.replaceState(null, '', sanitizeReturnTo(new URL(fallback, location.origin).searchParams.get('return_to')!));
    const next = await boot();
    expect(location.pathname).toBe('/');
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
    expect('adapter' in next && next.topBarTools).toBeNull();
  });

  it('keeps the new Scope after interrupted long login followed by same-path short login', async () => {
    const previous = `?v=1&scopeId=MEM&conditions=${'a'.repeat(2200)}`;
    history.replaceState(null, '', path + previous);
    const first = await createRealAssembly({ bootstrap: async () => ({ kind: 'login' }), where: () => location })();
    expect(first).toEqual({ redirect: `/auth/login?return_to=${encodeURIComponent(path)}` });
    const explicit = '?v=1&scopeId=FDRY';
    history.replaceState(null, '', path + explicit);
    const second = await createRealAssembly({ bootstrap: async () => ({ kind: 'login' }), where: () => location })();
    expect(second).toEqual({ redirect: `/auth/login?return_to=${encodeURIComponent(path + explicit)}` });
    const outcome = await boot();
    expect(location.search).toBe(explicit);
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
    expect('adapter' in outcome && outcome.topBarTools).toBeNull();
  });

  it('keeps existing explicit conditions on a ready boot and silently consumes the pending record', async () => {
    history.replaceState(null, '', path + '?v=1&scopeId=FDRY&q=new');
    sessionStorage.setItem(LOGIN_RETURN_KEY, record());
    const replace = vi.spyOn(history, 'replaceState');
    const outcome = await boot();
    expect(location.search).toBe('?v=1&scopeId=FDRY&q=new');
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
    expect('adapter' in outcome && outcome.topBarTools).toBeNull();
  });

  it('a ready boot with a long address does not create a new login record', async () => {
    history.replaceState(null, '', path + search);
    await boot();
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
  });

  it('restores on a matching path before the ready assembly reaches the router, preserving history state', async () => {
    history.replaceState({ marker: 1 }, '', path);
    sessionStorage.setItem(LOGIN_RETURN_KEY, record());
    const replace = vi.spyOn(history, 'replaceState');
    const outcome = await boot();
    expect('adapter' in outcome).toBe(true);
    expect(window.location.pathname + window.location.search).toBe(path + search);
    expect(replace).toHaveBeenCalledWith({ marker: 1 }, '', path + search);
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
    expect(restoreLoginReturn()).toBe('absent');
  });

  it.each([
    ['different path', { path: '/other' }],
    ['stale', { savedAt: Date.now() - LOGIN_RETURN_MAX_AGE_MS }],
    ['future', { savedAt: Date.now() + LOGIN_RETURN_MAX_AGE_MS }],
    ['protocol relative', { path: '//evil' }],
    ['backslash', { search: '?q=\\evil' }],
    ['control character', { search: '?q=\u0001' }],
    ['whitespace', { search: '?q=bad value' }],
    ['invalid search', { search: '//evil' }],
    ['invalid timestamp', { savedAt: 'today' }],
  ])('rejects %s, consumes the record, and tells the user', async (_name, overrides) => {
    history.replaceState(null, '', path);
    sessionStorage.setItem(LOGIN_RETURN_KEY, record(overrides));
    const outcome = await boot();
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
    expect(location.search).toBe('');
    expect('adapter' in outcome).toBe(true);
    if ('adapter' in outcome) render(<StrictMode>{outcome.topBarTools}</StrictMode>);
    expect(notify).toHaveBeenCalledExactlyOnceWith('이전 조회 조건을 복원하지 못했습니다.', { tone: 'warning' });
  });

  it.each(['{broken', 'null', '[]'])('consumes unreadable data (%s) and reports rejection', raw => {
    sessionStorage.setItem(LOGIN_RETURN_KEY, raw);
    expect(restoreLoginReturn()).toBe('rejected');
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
  });

  it('deletes before parsing or replacing and consumes even when history fails', () => {
    history.replaceState(null, '', path);
    sessionStorage.setItem(LOGIN_RETURN_KEY, record());
    vi.spyOn(history, 'replaceState').mockImplementation(() => {
      expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
      throw new Error('history blocked');
    });
    expect(restoreLoginReturn()).toBe('rejected');
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull();
  });

  it('falls back to the current full login address if storage writes fail', () => {
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(loginHref({ pathname: path, search })).toBe(`/auth/login?return_to=${encodeURIComponent(path + search)}`);
  });

  it('guards a blocked storage getter for saving and restoration', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(loginHref({ pathname: path, search })).toBe(`/auth/login?return_to=${encodeURIComponent(path + search)}`);
    expect(restoreLoginReturn()).toBe('rejected');
  });

  it('attempts deletion even when the storage read throws', () => {
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'getItem').mockImplementation(() => { throw new Error('read'); });
    const remove = vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'removeItem');
    expect(restoreLoginReturn()).toBe('rejected');
    expect(remove).toHaveBeenCalledWith(LOGIN_RETURN_KEY);
  });

  it('does not restore if one-time deletion fails', () => {
    history.replaceState(null, '', path);
    sessionStorage.setItem(LOGIN_RETURN_KEY, record());
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'removeItem').mockImplementation(() => { throw new Error('delete'); });
    expect(restoreLoginReturn()).toBe('rejected');
    expect(location.search).toBe('');
  });

  it('does not consume a pending return until bootstrap confirms login', async () => {
    history.replaceState(null, '', path);
    const raw = record();
    sessionStorage.setItem(LOGIN_RETURN_KEY, raw);
    const outcome = await createRealAssembly({ bootstrap: async () => ({ kind: 'login' }), where: () => location })();
    expect('redirect' in outcome).toBe(true);
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBe(raw);
  });

  it('blocked storage shows a warning while allowing normal routing', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    const outcome = await boot();
    expect('adapter' in outcome).toBe(true);
    if ('adapter' in outcome) render(<StrictMode>{outcome.topBarTools}</StrictMode>);
    expect(notify).toHaveBeenCalledExactlyOnceWith('이전 조회 조건을 복원하지 못했습니다.', { tone: 'warning' });
  });

  it.each(['/', '/home?q=x&scopeId=MEM', '//evil', '/\\evil', '/\t/evil', '/x\u0000', '/x\u0085', '/x y', '/a/..//evil', 'https://evil', '/%2f%2fevil', '/x?q=%20'])('mirrors server URL safety for %j (length intentionally excluded)', value => {
    expect(isSafeLoginReturn(value)).toBe(sanitizeReturnTo(value) === value);
  });
});
