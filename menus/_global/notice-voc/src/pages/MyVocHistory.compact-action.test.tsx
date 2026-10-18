import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import { Megaphone } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import MyVocHistory from './MyVocHistory';
import { setFeedbackOpsOrigin } from '../feedbackops-origin';
import { myVocHistoryEndpoint, type MyVocItem, type MyVocPage, type MySurveyPage } from '../endpoints';

// ADR-0037 compact action column: a scrollport between 192px and 248px keeps the FeedbackOps action pinned as an icon with today's name.
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
const session = testSession(['platform:view', 'notice:view', 'voc:view'], { user: { id: 'user-a', name: 'user-a', title: { ko: 'a', en: 'a' } } });
const adapter = testAdapter({
  menuQuery: async (request: MenuQuery) => {
    if (request.endpoint !== myVocHistoryEndpoint.id) {
      const survey: ApiResponse<MySurveyPage> = { outcome: 'ok', data: { items: [] }, trust: null, correlationId: 'fixture', assessments: [{ kind: 'respondent_history', state: 'unknown', reason: 'source_unavailable' }] };
      return survey;
    }
    const page: ApiResponse<MyVocPage> = { outcome: 'ok', data: { items: [ROW], nextCursor: null }, assessments: [], trust: null, correlationId: 'fixture' };
    return page;
  },
  session: () => session,
});

let restoreGeometry: () => void;
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, clear: () => data.clear(), key: () => null, get length() { return data.size; } });
  restoreGeometry = stubCompactTableGeometry();
  window.history.replaceState(null, '', '/voc');
});
afterEach(() => {
  cleanup(); restoreGeometry(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setFeedbackOpsOrigin(null);
  window.history.replaceState(null, '', '/');
});

const mount = () => render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><MyVocHistory /></PlatformProvider></I18nProvider>);

describe('MyVocHistory compact action', () => {
  it('renders an external icon link with the same name, href and target', async () => {
    setFeedbackOpsOrigin('https://feedback.example.com');
    mount();
    // The first render of this page exceeds the 1s default wait under parallel load (#434, #437).
    const link = await screen.findByRole('link', { name: 'VOC-M-1001 FeedbackOps에서 보기' }, { timeout: 8000 });
    expect(link.getAttribute('href')).toContain('feedback.example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('keeps the disabled icon button with aria-describedby when there is no origin', async () => {
    setFeedbackOpsOrigin(null);
    mount();
    // The first render of this page exceeds the 1s default wait under parallel load (#434, #437).
    const button = await screen.findByRole('button', { name: 'VOC-M-1001 FeedbackOps에서 보기' }, { timeout: 8000 }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toContain('FeedbackOps 주소가 없거나 올바르지 않아');
  });
});
