import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { json, listOf, registry, stubFetch, switchableAdapter } from './fo/test-support';
import { homeTodoSlot } from '@ap/feature-bridge/home-todo-slot';

const SURVEY_ID = '33333333-3333-4333-8333-333333333333';
const surveys = { items: [{ survey_id: SURVEY_ID, display_id: 'SRV-1', title: '만족도 설문', type: 'discovery', question_count: 2, opened_at: '2026-10-20T00:00:00.000Z' }], page: { has_more: false } };

function mountTodo() {
  const { Todo } = homeTodoSlot;
  return render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}><Todo /></PlatformProvider></I18nProvider>);
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); });

describe('home 내 할 일 slot', () => {
  it('C1 renders nothing and requests nothing without a FeedbackOps API (mock preview)', async () => {
    setFeatureApi(null);
    const calls = stubFetch(() => json({}));
    const { container } = mountTodo();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('실서버 필요')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('C1 shows the section in a ready session', async () => {
    setFeatureApi({ basePath: '/api/fo', onSessionLost: vi.fn() });
    stubFetch(path => path.startsWith('/api/fo/me/answerable-surveys') ? json(surveys) : path.startsWith('/api/fo/notifications') ? listOf() : json({ requests: [] }));
    mountTodo();
    expect(await screen.findByRole('region', { name: '내 할 일' })).toBeTruthy();
    expect(screen.getByText('만족도 설문')).toBeTruthy();
  });

  it('C2 renders nothing once the session is retired by a 401', async () => {
    const onSessionLost = vi.fn();
    setFeatureApi({ basePath: '/api/fo', onSessionLost });
    stubFetch(path => path.startsWith('/api/fo/me/answerable-surveys') ? json(surveys)
      : path.startsWith('/api/fo/notifications') ? json({ code: 'auth.session_invalid', message: 'no session' }, 401)
      : json({ requests: [] }));
    const { container } = mountTodo();
    await waitFor(() => expect(onSessionLost).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
