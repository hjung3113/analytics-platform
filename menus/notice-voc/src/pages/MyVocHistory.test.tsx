import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, MyVocItem, MyVocPage, MyVocQuery, PlatformAdapter, Session } from '@ap/contracts';
import { Megaphone } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { manifests } from '../index';
import MyVocHistory from './MyVocHistory';

// Real manifests so /voc keeps its declared pageKeys (cursor); only the group/space wiring is added.
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: 'notices' }],
  groups: [{ id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice·VOC' }, icon: Megaphone, space: 'analytics' }],
  menus: manifests,
});

const ROW: MyVocItem = {
  id: 'e1111111-1111-4111-8111-111111111111', displayId: 'VOC-M-1001', title: 'Overlay drift (mock)',
  status: 'progress', openedAt: '2026-09-26T02:00:00.000Z', updatedAt: '2026-09-26T06:00:00.000Z',
  managedSystemId: '11111111-1111-4111-8111-111111111111',
};

/** Fixture adapter: a stale cursor errors (the mock's "Invalid cursor"), page 1 succeeds. */
function fixture() {
  const session: Session = { user: { id: 'user-a', name: 'user-a', title: { ko: 'a', en: 'a' }, permissions: ['platform:view', 'notice:view', 'voc:view'] }, scopes: [] };
  const calls: MyVocQuery[] = [];
  const okPage: ApiResponse<MyVocPage> = { outcome: 'ok', data: { items: [ROW], nextCursor: null }, assessments: [], trust: null, correlationId: 'fixture' };
  const adapter: PlatformAdapter = {
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    myVocHistory: async (query: MyVocQuery) => {
      calls.push(query);
      if (query.cursor !== undefined) return { outcome: 'error', data: null, message: 'Invalid cursor', assessments: [], trust: null, correlationId: 'fixture' };
      return okPage;
    },
    mySurveyHistory: async () => ({
      outcome: 'ok', data: { items: [] }, trust: null, correlationId: 'fixture',
      assessments: [{ kind: 'respondent_history', state: 'unknown', reason: 'source_unavailable' }],
    }),
    // Nothing in this test announces a session change; an empty unsubscribe is enough.
    subscribe: () => () => undefined,
  };
  return { adapter, calls };
}

// Node's own (file-less) localStorage shadows jsdom's here, so give the test an in-memory store.
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; },
  });
  window.history.replaceState(null, '', '/voc?cursor=mock:engineer:2');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('MyVocHistory cursor reset (issue #60 review)', () => {
  it('keeps the 처음 reset reachable while a stale cursor errors, and reset requeries page 1', async () => {
    const f = fixture();
    render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><MyVocHistory /></PlatformProvider></I18nProvider>);
    // The stale cursor (issued by the previous role) errors; the error must stay visible — only the
    // reset control may appear outside the outcome view.
    expect(await screen.findByText('Invalid cursor')).toBeTruthy();
    expect(screen.queryByText('VOC-M-1001')).toBeNull();
    // Regression: this button used to exist only inside the success child, so an errored cursor page
    // offered Retry forever and the only way out was a manual URL edit.
    fireEvent.click(screen.getByRole('button', { name: '처음' }));
    // v=1 is the URL contract version serializeGlobal always writes; cursor must be gone.
    expect(window.location.pathname + window.location.search).toBe('/voc?v=1');
    // The stale-cursor error cleared and page 1 requeries: the adapter's last call carries no cursor.
    await waitFor(() => expect(screen.queryByText('Invalid cursor')).toBeNull());
    expect(f.calls.at(-1)).toEqual({});
    // The table virtualizer renders no rows in jsdom, so assert the pager: page 1 of 1 after reset.
    expect(await screen.findByText(/1\/1/)).toBeTruthy();
  });
});
