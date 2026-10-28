import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { ID_A, ID_B, json, listOf, notification, registry, stubFetch, switchableAdapter } from '../fo/test-support';
import HomeTodo from '@ap/feature-bridge/home-todo-page';

const SURVEY_ID = '33333333-3333-4333-8333-333333333333';
const request = { id: ID_A, requested_capability: 'voc.read', requested_managed_system_id: null, reason: '사유', requested_object_type: null, requested_object_id: null, source_object_type: null, source_object_id: null, source_action_id: null, revision: 1, requested_expiration: null, updated_at: new Date().toISOString(), return_route_intent: null, status: 'pending', created_at: new Date().toISOString() };

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/fo', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); });

describe('HomeTodo page', () => {
  it('C2 links the three groups to platform pages', async () => {
    stubFetch(path => path.startsWith('/api/fo/me/answerable-surveys')
      ? json({ items: [{ survey_id: SURVEY_ID, display_id: 'SRV-1', title: '만족도 설문', type: 'discovery', question_count: 2, opened_at: '2026-10-20T00:00:00.000Z' }], page: { has_more: false } })
      : path.startsWith('/api/fo/notifications')
        ? listOf(notification(ID_A, { event_type: 'voc.public_update_posted', detail: { voc_id: ID_B }, subject_ref: { visibility_state: 'allowed', display_id: 'VOC-1', title: '내 VOC 제목' } }))
        : json({ requests: [request] }));
    render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}><HomeTodo /></PlatformProvider></I18nProvider>);
    const region = await screen.findByRole('region', { name: '내 할 일' });
    const pathOf = (name: string) => within(region).getByRole('link', { name: new RegExp(name) }).getAttribute('href')!.split('?')[0];
    expect(pathOf('만족도 설문')).toBe(`/survey/${SURVEY_ID}/respond`);
    expect(pathOf('내 VOC 제목')).toBe(`/voc/${ID_B}`);
    expect(pathOf('대기 중')).toBe('/permission-requests');
    expect(screen.queryByText('실서버 필요')).toBeNull();
  });
});
