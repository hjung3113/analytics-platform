import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, MenuQuery, PlatformAdapter, Session } from '@ap/contracts';
import { Megaphone } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { manifests } from '../index';
import MyVocHistory from './MyVocHistory';
import { setFeedbackOpsOrigin } from '../feedbackops-origin';
import { myVocHistoryEndpoint, type MyVocItem, type MyVocPage, type MySurveyPage } from '../endpoints';

// Real manifests so /voc keeps its declared pageKeys (cursor); only the group/space wiring is added.
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'notices' }],
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
  const calls: unknown[] = [];
  const okPage: ApiResponse<MyVocPage> = { outcome: 'ok', data: { items: [ROW], nextCursor: null }, assessments: [], trust: null, correlationId: 'fixture' };
  const adapter: PlatformAdapter = {
    menuQuery: async (request: MenuQuery) => {
      if (request.endpoint !== myVocHistoryEndpoint.id) {
        const survey: ApiResponse<MySurveyPage> = {
          outcome: 'ok', data: { items: [] }, trust: null, correlationId: 'fixture',
          assessments: [{ kind: 'respondent_history', state: 'unknown', reason: 'source_unavailable' }],
        };
        return survey;
      }
      const { cursor } = request.params as { cursor: string | null };
      calls.push(request.params);
      if (cursor !== null) return { outcome: 'error', data: null, message: 'Invalid cursor', assessments: [], trust: null, correlationId: 'fixture' };
      return okPage;
    },
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
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
    expect(f.calls.at(-1)).toEqual({ cursor: null });
    // The table virtualizer renders no rows in jsdom, so assert the pager: page 1 of 1 after reset.
    expect(await screen.findByText(/1\/1/)).toBeTruthy();
  });
});

// #302 C-14: origin이 없으면 안내 문장은 표 위에 한 번, 버튼 라벨은 짧은 이름으로 disabled를 유지한다.
describe('MyVocHistory FeedbackOps origin (#302 review)', () => {
  afterEach(() => { setFeedbackOpsOrigin(null); });

  it('renders one guidance above the table and keeps short disabled buttons without links', async () => {
    window.history.replaceState(null, '', '/voc');
    setFeedbackOpsOrigin(null);
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    // jsdom zero layout empties the virtual range; the PlatformDataTable-test fixed metrics let rows render.
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const height = this.getAttribute('role') === 'row' ? 32 : 420;
      return { width: 800, height, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON() {} };
    });
    try {
      const f = fixture();
      render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><MyVocHistory /></PlatformProvider></I18nProvider>);
      expect(await screen.findByText('VOC-M-1001')).toBeTruthy();
      // The long guidance sentence appears exactly once (StateMessage above the table), never as a button label.
      const guidance = 'FeedbackOps 주소가 없거나 올바르지 않아 링크를 만들지 않습니다.';
      expect(screen.getAllByText(guidance)).toHaveLength(1);
      // Primary and row controls keep short names and stay disabled (fail closed).
      const createButton = screen.getByRole('button', { name: 'VOC 등록' }) as HTMLButtonElement;
      expect(createButton.disabled).toBe(true);
      // W-302 FIX1: both disabled controls reference the guidance element as their accessible description.
      expect(document.getElementById(createButton.getAttribute('aria-describedby') ?? '')?.textContent).toContain(guidance);
      // W-302 FIX1: the visible text is the short 보기; the accessible name carries the row's displayId (#301 pattern).
      for (const button of screen.getAllByRole('button', { name: 'VOC-M-1001 FeedbackOps에서 보기' })) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(button.textContent).toBe('보기');
        expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toContain(guidance);
      }
      // No external anchor is rendered for either control.
      expect(screen.queryByRole('link', { name: 'VOC 등록' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'VOC-M-1001 FeedbackOps에서 보기' })).toBeNull();
    } finally {
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    }
  });

  it('renders real links and no guidance when the origin is set', async () => {
    window.history.replaceState(null, '', '/voc');
    setFeedbackOpsOrigin('https://feedback.example.com');
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return (this as Element).getAttribute('role') === 'row' ? 32 : 420; } });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 800; } });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const height = this.getAttribute('role') === 'row' ? 32 : 420;
      return { width: 800, height, top: 0, left: 0, right: 800, bottom: height, x: 0, y: 0, toJSON() {} };
    });
    try {
      render(<I18nProvider><PlatformProvider adapter={fixture().adapter} registry={registry}><MyVocHistory /></PlatformProvider></I18nProvider>);
      const rowLink = await screen.findByRole('link', { name: 'VOC-M-1001 FeedbackOps에서 보기' });
      // The visible text stays the short 보기; the accessible name carries the row's displayId (#301 pattern).
      expect(rowLink.textContent).toBe('보기');
      expect(rowLink.getAttribute('href')).toContain('feedback.example.com');
      expect(screen.queryByText('FeedbackOps 연결 없음')).toBeNull();
      expect(screen.queryByRole('button', { name: 'VOC 등록' })).toBeNull();
    } finally {
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
    }
  });
});
