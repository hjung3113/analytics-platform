import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { foQueryClient } from '@ap/fo-bridge';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { NO_FEATURES, contextCapabilities, groupId, spaceId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { dashboardLinks } from './FoDashboard';
import { mountAt } from '../test-support';

const dashboard = vi.hoisted(() => ({ props: [] as unknown[], refresh: vi.fn() }));
vi.mock('@fops/frontend/operator-screens/dashboard', () => ({
  DashboardScreen: (props: unknown) => { dashboard.props.push(props); return <div data-testid="dashboard" />; },
  refreshDashboard: dashboard.refresh,
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); dashboard.props.length = 0; dashboard.refresh.mockReset(); });
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('대시보드 without a FeedbackOps API (mock preview)', () => {
  it('shows 실서버 필요 with 새로고침 disabled and mounts no dashboard', async () => {
    mountAt('/feedbackops');
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect((screen.getByRole('button', { name: '새로고침' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('dashboard')).toBeNull();
  });
});

describe('대시보드 through the FeedbackOps bridge', () => {
  beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it('enables 새로고침 once the session is ready and refreshes the scoped summary', async () => {
    mountAt(`/feedbackops?managedSystem=${SYSTEM}`);
    const button = await screen.findByRole('button', { name: '새로고침' }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(dashboard.props.at(-1)).toEqual({ managedSystemId: SYSTEM });
    fireEvent.click(button);
    expect(dashboard.refresh).toHaveBeenCalledWith(foQueryClient, SYSTEM);
  });

  it('does not send a managedSystem value that is not a uuid, and leaves it in the URL', async () => {
    mountAt('/feedbackops?managedSystem=not-a-uuid');
    await screen.findByTestId('dashboard');
    expect(dashboard.props.at(-1)).toEqual({});
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(dashboard.refresh).toHaveBeenCalledWith(foQueryClient, undefined);
    expect(window.location.search).toBe('?managedSystem=not-a-uuid');
  });
});

describe('대시보드 host links', () => {
  const stub = (id: string, path: string, extra: Partial<MenuEntry> = {}): MenuEntry => ({
    id, group: groupId('myActivity'), label: { ko: id, en: id }, description: { ko: id, en: id }, path, permission: 'platform:view',
    requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['returnTo'], ...extra,
  }) as MenuEntry;
  const registry = createRegistry({
    spaces: [{ id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'platform:view', homeMenuId: 'voc' }],
    groups: [{ id: groupId('myActivity'), label: { ko: '내 활동', en: 'Mine' }, space: spaceId('feedbackops') }],
    menus: [stub('voc', '/voc', { primary: true }), stub('surveys', '/surveys'), stub('survey-respond', '/surveys/:surveyId/respond', { parent: 'surveys', navHidden: true })],
  } as never);
  const SURVEY = '44444444-4444-4444-8444-444444444444';
  const { Link, canLink } = dashboardLinks;

  it('links the survey paths and 내 VOC to their platform menus and leaves operator routes inert', () => {
    const session = testSession(['platform:view']);
    window.history.replaceState(null, '', '/');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
      <Link to="/surveys/participate">참여</Link>
      <Link to={`/surveys/${SURVEY}/respond`}>응답하기</Link>
      <Link to="/vocs?view=my">내 VOC</Link>
      <Link to="/tasks?view=board">보드</Link>
    </PlatformProvider></I18nProvider>);
    expect(screen.getByRole('link', { name: '참여' }).getAttribute('href')).toContain('/surveys');
    expect(screen.getByRole('link', { name: '응답하기' }).getAttribute('href')).toContain(`/surveys/${SURVEY}/respond`);
    expect(screen.getByRole('link', { name: '내 VOC' }).getAttribute('href')).toContain('/voc');
    expect(screen.queryByRole('link', { name: '보드' })).toBeNull();
    expect(canLink('/tasks?view=board')).toBe(false);
    expect(canLink('/vocs?view=inbox')).toBe(false);
    expect(canLink('/vocs?view=my&extra=1')).toBe(false);
  });
});
