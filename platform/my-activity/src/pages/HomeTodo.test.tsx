import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { ID_A, ID_B, homeTodoRegistry, json, listOf, notification, registry, stubFetch, switchableAdapter } from '../feature/test-support';
import HomeTodo from '@ap/feature-bridge/home-todo-page';

const SURVEY_ID = '33333333-3333-4333-8333-333333333333';
const request = { id: ID_A, requested_capability: 'voc.read', requested_managed_system_id: null, reason: '사유', requested_object_type: null, requested_object_id: null, source_object_type: null, source_object_id: null, source_action_id: null, revision: 1, requested_expiration: null, updated_at: new Date().toISOString(), return_route_intent: null, status: 'pending', created_at: new Date().toISOString() };

function stubHomeTodoQueueReads() {
  return stubFetch(path => path.includes('/nav/counts')
    ? json({ counts: { 'voc.tab.unassigned': 4 } })
    : path.includes('/me/permissions/check')
      ? json({ state: 'approved', decision: { allow: true } })
      : path.startsWith('/api/features/permissions/requests')
        ? json({ requests: [{ id: ID_A, status: 'pending', batch_id: ID_B }], count: 1 })
        : path.startsWith('/api/features/me/answerable-surveys')
          ? json({ items: [], page: { has_more: false } })
          : path.startsWith('/api/features/notifications')
            ? json({ items: [], page: { has_more: false }, unread_count: 0 })
            : json({ requests: [] }));
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); });

describe('HomeTodo page', () => {
  it('C2 links the three groups to platform pages', async () => {
    stubFetch(path => path.startsWith('/api/features/me/answerable-surveys')
      ? json({ items: [{ survey_id: SURVEY_ID, display_id: 'SRV-1', title: '만족도 설문', type: 'discovery', question_count: 2, opened_at: '2026-10-20T00:00:00.000Z' }], page: { has_more: false } })
      : path.startsWith('/api/features/notifications')
        ? listOf(notification(ID_A, { event_type: 'voc.public_update_posted', detail: { voc_id: ID_B }, subject_ref: { visibility_state: 'allowed', display_id: 'VOC-1', title: '내 VOC 제목' } }))
        : json({ requests: [request] }));
    render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}><HomeTodo /></PlatformProvider></I18nProvider>);
    const region = await screen.findByRole('region', { name: '내 할 일' });
    const pathOf = (name: string) => within(region).getByRole('link', { name: new RegExp(name) }).getAttribute('href')!.split('?')[0];
    expect(pathOf('만족도 설문')).toBe(`/survey/${SURVEY_ID}/respond`);
    expect(pathOf('내 VOC 제목')).toBe(`/voc/${ID_B}`);
    expect(pathOf('검토 중')).toBe('/permission-requests');
    expect(screen.queryByText('실서버 필요')).toBeNull();
  });

  it('C3 links the more-unread overflow to the notifications page, with and without a VOC row', async () => {
    for (const withVoc of [true, false]) {
      stubFetch(path => path.startsWith('/api/features/notifications')
        ? json({ items: withVoc ? [notification(ID_A, { event_type: 'voc.public_update_posted', detail: { voc_id: ID_B }, subject_ref: { visibility_state: 'allowed', display_id: 'VOC-1', title: '내 VOC 제목' } })] : [], page: { has_more: true }, unread_count: 60 })
        : path.startsWith('/api/features/me/answerable-surveys') ? json({ items: [], page: { has_more: false } }) : json({ requests: [] }));
      render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}><HomeTodo /></PlatformProvider></I18nProvider>);
      const region = await screen.findByRole('region', { name: '내 할 일' });
      const more = await within(region).findByRole('link', { name: /모두 보기/ });
      expect(more.getAttribute('href')!.split('?')[0]).toBe('/notifications');
      cleanup();
    }
  });

  it('C4 does not read either queue without features access, even when console access is present', async () => {
    const calls = stubHomeTodoQueueReads();
    render(<I18nProvider><PlatformProvider adapter={switchableAdapter('user-a', ['platform:view', 'console:access']).adapter} registry={homeTodoRegistry}><HomeTodo /></PlatformProvider></I18nProvider>);

    await waitFor(() => expect(calls.filter(call =>
      call.path.includes('/me/answerable-surveys') || call.path.includes('/notifications') || call.path.includes('/permission-requests/mine'),
    )).toHaveLength(3));
    expect(screen.queryByTestId('home-todo-queue-counts')).toBeNull();
    expect(calls.some(call => call.path.includes('/nav/counts'))).toBe(false);
    expect(calls.some(call => call.path.includes('/me/permissions/check'))).toBe(false);
    expect(calls.some(call => call.path.includes('/permissions/requests'))).toBe(false);
  });

  it('C4 reads VOC triage with features access but omits permission review without console access', async () => {
    const calls = stubHomeTodoQueueReads();
    render(<I18nProvider><PlatformProvider adapter={switchableAdapter('user-a', ['platform:view', 'features:access']).adapter} registry={homeTodoRegistry}><HomeTodo /></PlatformProvider></I18nProvider>);

    const triage = await screen.findByRole('link', { name: '분류할 VOC 4' });
    const href = new URL(triage.getAttribute('href')!, 'http://localhost');
    expect(href.pathname).toBe('/flow/triage');
    expect(href.searchParams.get('tab')).toBe('unassigned');
    expect(screen.queryByText(/검토할 권한 요청/)).toBeNull();
    expect(calls.some(call => call.path.includes('/nav/counts'))).toBe(true);
    expect(calls.some(call => call.path.includes('/me/permissions/check'))).toBe(false);
    expect(calls.some(call => call.path.includes('/permissions/requests'))).toBe(false);
  });

  it('C4 maps both queue links to their registered destinations and the review default tab', async () => {
    stubHomeTodoQueueReads();
    render(<I18nProvider><PlatformProvider adapter={switchableAdapter('user-a', ['platform:view', 'features:access', 'console:access']).adapter} registry={homeTodoRegistry}><HomeTodo /></PlatformProvider></I18nProvider>);

    const triage = new URL((await screen.findByRole('link', { name: '분류할 VOC 4' })).getAttribute('href')!, 'http://localhost');
    const review = new URL((await screen.findByRole('link', { name: '검토할 권한 요청 1' })).getAttribute('href')!, 'http://localhost');
    expect(triage.pathname).toBe('/flow/triage');
    expect(triage.searchParams.get('tab')).toBe('unassigned');
    expect(review.pathname).toBe('/operations/permission-request-review');
    expect(review.searchParams.has('tab')).toBe(false);
  });
});
