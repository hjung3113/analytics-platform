// Migrated #849/#864 fixtures; real platform saved views and InboxScreen host.
import { useLayoutEffect } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { FeatureBridge, operatorHostLinks, useInboxSearch, useInboxHere, featureQueryClient, setFeatureApi } from '@ap/feature-bridge';
import { savedViewsSlot } from '@ap/feature-bridge/saved-views';
import { InboxScreen } from '@ap/feature-screens/operator-screens/voc-inbox';
import { registry } from '../test-support';
import { spaceId } from '@ap/contracts';
export const ME = {
  actor: {
    id: 'actor-1',
    external_id: 'mock-admin-1',
    email: 'admin@example.test',
    display_name: 'Mock Admin',
    role_level: 'admin',
  },
  workspace_id: 'workspace-1',
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export interface SavedViewRow {
  id: string;
  surface: 'voc';
  name: string;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function savedView(id: string, name: string, filter: Record<string, unknown>): SavedViewRow {
  return {
    id,
    surface: 'voc',
    name,
    filter,
    created_at: '2026-10-08T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
  };
}

export interface AuthedVocsRequest {
  url: string;
  method: string;
  body?: unknown;
}


export interface AuthedVocsMount {
 requests: AuthedVocsRequest[];
 unhandled: AuthedVocsRequest[];
 router: { state: { location: { search: Record<string, unknown>; searchStr: string } } };
}
export const stringifyAppSearch = (search: Record<string, string>) => `?${new URLSearchParams(search)}`;
const Body = savedViewsSlot.For(spaceId('feedbackops'))!.Body;
afterEach(() => { cleanup(); featureQueryClient.clear(); setFeatureApi(null); window.history.replaceState(null, '', '/'); });
export function mountAuthedVocs({ initialPath, vocsShell = false, handle }: {
 initialPath: string; vocsShell?: boolean;
 handle?: (request: AuthedVocsRequest) => Response | Promise<Response> | undefined;
}): AuthedVocsMount {
  const requests: AuthedVocsRequest[] = [];
  const unhandled: AuthedVocsRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace('/api/features', '');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const request: AuthedVocsRequest = { url, method, ...(body !== undefined ? { body } : {}) };
    requests.push(request);
    if (handle) {
      const handled = await handle(request);
      if (handled !== undefined) return handled;
    }
    // Shared defaults are read-only and match method + pathname, ignoring the
    // query string. Anything else is unexpected: record it and fail the app
    // with a 500 instead of answering `200 {}`, which reads as an empty
    // success and lets the test pass silently.
    const pathname = new URL(url, 'http://localhost').pathname;
    if (method === 'GET') {
      if (pathname === '/me') return jsonResponse(200, ME);
      if (pathname.startsWith('/managed-systems')) {
        return jsonResponse(200, { items: [], total: 0 });
      }
      if (pathname.startsWith('/analytics-areas')) return jsonResponse(200, { items: [] });
      if (pathname.startsWith('/actors')) return jsonResponse(200, { items: [] });
      if (pathname.startsWith('/nav/counts')) return jsonResponse(200, { counts: {} });
      if (pathname === '/me/permissions/scope') {
        return jsonResponse(200, { scope: { kind: 'all' } });
      }
      if (pathname.startsWith('/me/permissions/check')) {
        return jsonResponse(200, { state: 'approved', decision: { allow: true, via: 'role' } });
      }
      if (pathname.startsWith('/notifications')) {
        return jsonResponse(200, { items: [], page: { has_more: false }, unread_count: 0 });
      }
    }
    unhandled.push(request);
    return jsonResponse(500, { error: { code: 'test.unhandled_request' } });
  });
  vi.stubGlobal('fetch', fetchMock as typeof globalThis.fetch);


  featureQueryClient.clear();
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  const url = new URL(initialPath, 'http://localhost');
  url.searchParams.delete('view');
  window.history.replaceState(null, '', `/feedbackops/vocs${url.search}`);
  const router: AuthedVocsMount['router'] = { state: { location: { search: {}, searchStr: '' } } };
  function Probe() {
    const search = useInboxSearch();
    useLayoutEffect(() => {
      router.state.location = { search, searchStr: `?${new URLSearchParams(Object.entries(search).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))}` };
    }, [search]);
    return null;
  }
  const session = testSession(['platform:view', 'features:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  render(<I18nProvider><PlatformProvider adapter={testAdapter({session: () => session})} registry={registry}>
    <Body /><Probe /><FeatureBridge {...operatorHostLinks} useSearch={useInboxSearch} useHere={useInboxHere}>
      {vocsShell ? <InboxScreen view="inbox" renderDetail={() => undefined} /> : null}
    </FeatureBridge>
  </PlatformProvider></I18nProvider>);
  return { requests, unhandled, router };
}
