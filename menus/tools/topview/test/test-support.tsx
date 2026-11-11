import { useEffect, type ComponentType } from 'react';
import { act, render } from '@testing-library/react';
import { Map as MapIcon } from 'lucide-react';
import { groupId, menuPermission, spaceId, type ApiResponse, type Assessment, type MenuQuery, type Trust } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../src/index.js';

export type QueryCall = { id: string; params: unknown; context: MenuQuery['context']; signal: AbortSignal | undefined };
export type QueryHandler = (call: QueryCall) => Promise<ApiResponse<unknown>>;

const KINDS = ['collection', 'processing_delay', 'coverage', 'time_domain'] as const;
/** The Data Trust of a read: the Kernel refuses an `ok`/`empty` reply whose assessments differ from the declared kinds, so a reply names all four. */
export const TRUST: Trust = { updatedAt: '2026-01-01T10:31:00', dataThrough: '2026-01-01T10:30:00', coverage: 1, provisional: false, source: 'synthetic' };
/** The four declared kinds, `clear` unless `overrides` says otherwise. */
export const assessments = (overrides: Partial<Record<(typeof KINDS)[number], Assessment>> = {}): Assessment[] =>
  KINDS.map((kind) => overrides[kind] ?? { kind, state: 'clear' });

export const response = <T,>(outcome: ApiResponse<T>['outcome'], data: T | null, extra: Partial<ApiResponse<T>> = {}): ApiResponse<T> =>
  ({ outcome, data, assessments: outcome === 'ok' || outcome === 'empty' ? assessments() : [], trust: TRUST, correlationId: 'corr-1', ...extra });
export const ok = <T,>(data: T, list: Assessment[] = assessments()): ApiResponse<T> => response('ok', data, { assessments: list });

export type FakeOptions = {
  path?: string;
  page?: Record<string, string>;
  /** `null` leaves the URL without a window. */
  context?: { from: string; to: string } | null;
  query: QueryHandler | null;
};

const registry = createRegistry({
  permissions: [menuPermission('eqv:view')],
  spaces: [{ id: spaceId('tools'), label: { ko: '도구', en: 'Tools' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'eqv:topview' }],
  groups: [{ id: groupId('topview'), label: { ko: '설비', en: 'Equipment' }, icon: MapIcon, space: spaceId('tools') }],
  menus: manifests,
});

type Platform = ReturnType<typeof usePlatform>;

/**
 * Mounts a viewer screen under the real Kernel (registry, URL state, query gates) with an adapter that records every read.
 * Page keys and the applied window live in the URL, as in the app.
 */
export function createFake(options: FakeOptions) {
  const log = { queries: [] as QueryCall[] };
  let platform!: Platform;
  const adapter = testAdapter({
    session: (() => { const session = testSession(['platform:view', 'eqv:view']); return () => session; })(),
    menuQuery: async (request, signal) => {
      const call: QueryCall = { id: request.endpoint, params: request.params, context: request.context, signal };
      log.queries.push(call);
      if (options.query === null) throw new Error('no query handler');
      return await options.query(call) as ApiResponse<never>;
    },
  });
  const search = new URLSearchParams({ v: '1', ...options.page, ...(options.context === null ? {} : options.context ?? {}) });
  window.history.replaceState(null, '', `${options.path ?? '/tools/eqv-topview'}?${search}`);
  function Capture() {
    const current = usePlatform();
    useEffect(() => { platform = current; });
    return null;
  }
  return {
    log,
    /** The page key as the address carries it. */
    page: (key: string) => new URLSearchParams(window.location.search).get(key),
    url: () => `${window.location.pathname}${window.location.search}`,
    setPage: (patch: Record<string, string | null>) => act(() => platform.setPage(patch)),
    setTime: (range: { from: string; to: string }) => act(() => platform.setGlobal(range)),
    render: (Screen: ComponentType) => render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Capture /><Screen /></PlatformProvider></I18nProvider>),
  };
}

export type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
