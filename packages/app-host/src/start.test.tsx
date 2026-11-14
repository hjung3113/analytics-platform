import { act, cleanup, screen } from '@testing-library/react';
import { lazy, useSyncExternalStore, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { menuPermission } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { removeStaleChunkNotice } from './stale-chunk-notice';
import { startAppHost } from './start';
import type { StartAppHostOptions } from './types';
import { AXES, QUERY_HISTORY, testAssembly, testDeclarations, testMenu } from './test-support';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  window.history.replaceState(null, '', '/first');
});
afterEach(() => { cleanup(); container.remove(); });

const start = (over: Partial<StartAppHostOptions> = {}) => startAppHost({ container, declarations: testDeclarations(), createAssembly: () => testAssembly(), equipmentAxes: AXES, queryHistory: QUERY_HISTORY, ...over });
const failure = () => screen.findByText('화면을 시작할 수 없습니다');

describe('startAppHost', () => {
  it('renders the app from a registry declaration and a mock-style assembly, with no slots', async () => {
    await start();
    expect(await screen.findByText('menu first')).toBeInTheDocument();
  });

  it('passes the host option productName to the shell: the tab title ends with it (#1944)', async () => {
    await start({ productName: 'Synthetic Product' });
    expect(await screen.findByText('menu first', {}, { timeout: 30_000 })).toBeInTheDocument();
    await vi.waitFor(() => expect(document.title).toMatch(/ · Synthetic Product$/), { timeout: 30_000 });
  });

  it('{ redirect } calls the injected redirect once and renders nothing', async () => {
    const redirect = vi.fn();
    await start({ createAssembly: () => ({ redirect: '/login' }), redirect });
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/login');
    expect(container).toBeEmptyDOMElement();
  });

  it('{ screen } renders the node without PlatformProvider', async () => {
    function Probe() {
      let inside = true;
      try { usePlatform(); } catch { inside = false; }
      return <p>{inside ? 'provider' : 'no provider'}</p>;
    }
    await start({ createAssembly: async () => ({ screen: <Probe /> as ReactNode }) });
    expect(await screen.findByText('no provider')).toBeInTheDocument();
  });

  it('a throwing createAssembly renders StartupFailure without the error text', async () => {
    await start({ createAssembly: () => { throw new Error('secret detail'); } });
    expect(await failure()).toBeInTheDocument();
    expect(screen.queryByText(/secret detail/)).toBeNull();
  });

  it.each([
    ['duplicate menu id', () => testDeclarations({ menus: [testMenu('first'), testMenu('first', { path: '/other' })] })],
    ['undeclared permission', () => testDeclarations({ permissions: [], menus: [testMenu('first', { permission: menuPermission('equipment:view') })] })],
  ])('a registry rejection (%s) renders StartupFailure and never reaches createAssembly', async (_name, declarations) => {
    const createAssembly = vi.fn(() => testAssembly());
    await start({ declarations: declarations(), createAssembly });
    expect(await failure()).toBeInTheDocument();
    expect(createAssembly).not.toHaveBeenCalled();
  });

  // A declaration error the Provider finds at render (after `await start()` resolved) still ends in StartupFailure, not a blank root (#1876).
  it.each([
    ['a Condition preset naming an undeclared axis', () => testDeclarations({ menus: [testMenu('first', {
      context: { ...testMenu('first').context, condition: 'apply' }, pageKeys: ['view'], conditionPreset: { key: 'view', default: 'a' },
      conditionPresets: [{ id: 'a', label: { ko: 'A', en: 'A' }, axes: ['fixture-axis-a'] }, { id: 'b', label: { ko: 'B', en: 'B' }, axes: ['fixture-axis-b'] }],
    })] })],
    ['a registry that declares no spaces', () => testDeclarations({ spaces: [], groups: [{ ...testDeclarations().groups[0]!, space: null }] })],
  ])('a render-time declaration error (%s) renders StartupFailure without the error text', async (_name, declarations) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await start({ declarations: declarations() });
    expect(await failure()).toBeInTheDocument();
    expect(screen.queryByText(/equipmentAxes|declares no spaces/)).toBeNull();
    error.mockRestore();
  });

  it('injected slots win over the generic defaults', async () => {
    await start({ createAssembly: () => testAssembly({ topBarTools: <span>default tools</span> }), slots: () => ({ topBarTools: <span>injected tools</span> }) });
    await screen.findByText('menu first');
    expect(screen.getByText('injected tools')).toBeInTheDocument();
    expect(screen.queryByText('default tools')).toBeNull();
  });

  it('slots runs in the root render and a hook-driven change re-renders the shell with the new slots', async () => {
    let label = 'before';
    const listeners = new Set<() => void>();
    const store = { subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); }, get: () => label };
    const useTestSlots = () => { const value = useSyncExternalStore(store.subscribe, store.get); return { topBarTools: <span>{value} tools</span> }; };
    await start({ slots: useTestSlots });
    expect(await screen.findByText('before tools')).toBeInTheDocument();
    await act(async () => { label = 'after'; listeners.forEach(l => l()); });
    expect(await screen.findByText('after tools')).toBeInTheDocument();
    expect(screen.queryByText('before tools')).toBeNull();
  });

  it('merges the assembly top-bar tools in as the default slot', async () => {
    await start({ createAssembly: () => testAssembly({ topBarTools: <span>default tools</span> }) });
    await screen.findByText('menu first');
    expect(screen.getByText('default tools')).toBeInTheDocument();
  });

  it('runs onAssembly with the assembly and registry before the first render', async () => {
    const order: string[] = [];
    const assembly = testAssembly();
    await start({
      createAssembly: () => assembly,
      onAssembly: (given, registry) => { order.push(`assembly:${given === assembly}:${registry.menus.length}`); },
      children: () => { order.push('render'); return null; },
    });
    await screen.findByText('menu first');
    expect(order[0]).toBe('assembly:true:1');
    expect(order).toContain('render');
  });

  it('mounts provider children inside the provider', async () => {
    function Child() { return <p>{`child sees ${usePlatform().registry.menus.length} menu`}</p>; }
    await start({ children: () => <Child /> });
    expect(await screen.findByText('child sees 1 menu')).toBeInTheDocument();
  });
});

describe('startAppHost invalidation', () => {
  it('subscribes the assembly invalidation source once the app is mounted', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    await start({ createAssembly: () => testAssembly({ invalidation: { subscribe } }) });
    await screen.findByText('menu first');
    expect(subscribe).toHaveBeenCalled();
  });
});

describe('startAppHost stale chunk notice (#1981)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
  afterEach(() => { removeStaleChunkNotice(); vi.unstubAllGlobals(); });

  it('installs the global notice: a vite:preloadError after start shows the reload button', async () => {
    await start();
    await screen.findByText('menu first', {}, { timeout: 10_000 });
    act(() => { window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })); });
    expect(await screen.findByRole('button', { name: '새로 고침' }, { timeout: 10_000 })).toBeInTheDocument();
  });

  it('a menu chunk failure that RouteErrorBoundary catches shows its own retry and no second notice', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const component = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/fixture-chunk.js')));
    await start({ declarations: testDeclarations({ menus: [testMenu('first', { component })] }) });
    expect(await screen.findByRole('button', { name: '다시 시도' }, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새로 고침' })).toBeNull();
    error.mockRestore();
  });
});

it.each(['assembly', 'render'])('reports a %s startup error through the injected hook (#2028 SHE-14)', async kind => {
  const problem = new Error('private startup details');
  const onStartupError = vi.fn();
  function Broken(): never { throw problem; }
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  await start({ onStartupError, createAssembly: () => {
    if (kind === 'assembly') throw problem;
    return { screen: <Broken /> };
  } });
  expect(await failure()).toBeInTheDocument();
  expect(onStartupError).toHaveBeenCalledExactlyOnceWith(problem);
  expect(screen.queryByText(problem.message)).toBeNull();
  consoleError.mockRestore();
});
