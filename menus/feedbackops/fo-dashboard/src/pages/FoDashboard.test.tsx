import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { foQueryClient } from '@ap/fo-bridge';
import { useEffect } from 'react';
import { I18nProvider, useI18n, PlatformProvider, createRegistry } from '@ap/kernel';
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

function English() { const { setLang } = useI18n(); useEffect(() => setLang('en'), [setLang]); return null; }

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

  it.each(['not-a-uuid', ''])('rejects the managedSystem value %j: nothing is mounted or requested, the URL is kept (ADR-0071 decision 9)', async value => {
    mountAt(`/feedbackops?managedSystem=${value}&focus=keep`);
    expect(await screen.findByText('주소의 managedSystem 값이 올바르지 않습니다')).toBeTruthy();
    expect(screen.queryByTestId('dashboard')).toBeNull();
    expect(screen.queryByRole('button', { name: '새로고침' })).toBeNull();
    expect(dashboard.props).toEqual([]);
    expect(window.location.search).toBe(`?managedSystem=${value}&focus=keep`);
  });

  it('clears only the rejected key and then mounts the unscoped dashboard', async () => {
    mountAt('/feedbackops?managedSystem=not-a-uuid&focus=keep');
    fireEvent.click(await screen.findByRole('button', { name: '값 지우기' }));
    await screen.findByTestId('dashboard');
    const search = new URLSearchParams(window.location.search);
    expect(search.has('managedSystem')).toBe(false);
    expect(search.get('focus')).toBe('keep');
    expect(dashboard.props.at(-1)).toEqual({});
  });

  it('labels the refresh button in English when the language is en', async () => {
    mountAt(`/feedbackops?managedSystem=${SYSTEM}`, <English />);
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeTruthy();
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
    // `canLink` reads the route tables only (#763 p1); the link stays unrendered because this registry has no fo-tasks.
    expect(canLink('/tasks?view=board')).toBe(true);
    expect(canLink('/vocs?view=my&extra=1')).toBe(false);
  });

  it('leaves a queue link inert without throwing when this registry has no fo-inbox', () => {
    const session = testSession(['platform:view']);
    window.history.replaceState(null, '', '/');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
      <Link to="/vocs?view=inbox&tab=unassigned">미배정</Link>
    </PlatformProvider></I18nProvider>);
    expect(screen.queryByRole('link', { name: '미배정' })).toBeNull();
    expect(screen.getByText('미배정')).toBeTruthy();
  });

  it('links the queue and coverage hrefs to 수신함 and Triage when the registry has them (#761)', () => {
    const live = createRegistry({
      spaces: [{ id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'platform:view', carriedPageKeys: ['managedSystem'], homeMenuId: 'fo-inbox' }],
      groups: [{ id: groupId('myActivity'), label: { ko: '내 활동', en: 'Mine' }, space: spaceId('feedbackops') }],
      menus: [stub('fo-inbox', '/feedbackops/vocs', { primary: true, pageKeys: ['focus', 'tab', 'area', 'managedSystem'] }), stub('fo-triage', '/feedbackops/triage', { pageKeys: ['focus', 'tab', 'area', 'managedSystem'] })],
    } as never);
    const session = testSession(['platform:view']);
    window.history.replaceState(null, '', '/');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={live}>
      <Link to={`/vocs?view=inbox&tab=unassigned&managedSystem=${SYSTEM}`}>미배정</Link>
      <Link to="/vocs?view=inbox&tab=high-no-link">연결 없음</Link>
      <Link to="/vocs?view=inbox&filter.analytics_area=unset">영역 미지정</Link>
      <Link to="/tasks?view=board">보드</Link>
    </PlatformProvider></I18nProvider>);
    const queue = new URL(screen.getByRole('link', { name: '미배정' }).getAttribute('href')!, 'http://x');
    expect(queue.pathname).toBe('/feedbackops/vocs');
    expect(queue.searchParams.get('tab')).toBe('unassigned');
    expect(queue.searchParams.get('managedSystem')).toBe(SYSTEM);
    expect(new URL(screen.getByRole('link', { name: '연결 없음' }).getAttribute('href')!, 'http://x').searchParams.get('tab')).toBe('high-no-link');
    expect(new URL(screen.getByRole('link', { name: '영역 미지정' }).getAttribute('href')!, 'http://x').searchParams.get('area')).toBe('unset');
    expect(screen.queryByRole('link', { name: '보드' })).toBeNull();
    expect(canLink('/vocs?view=inbox&tab=unassigned')).toBe(true);
  });

  it('links 보드 to the Tasks board when the registry has fo-tasks (#763 p1)', () => {
    const live = createRegistry({
      spaces: [{ id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'platform:view', carriedPageKeys: ['managedSystem'], homeMenuId: 'fo-tasks' }],
      groups: [{ id: groupId('myActivity'), label: { ko: '내 활동', en: 'Mine' }, space: spaceId('feedbackops') }],
      menus: [stub('fo-tasks', '/feedbackops/tasks', { primary: true, pageKeys: ['focus', 'q', 'publicUpdate', 'managedSystem'] })],
    } as never);
    const session = testSession(['platform:view']);
    window.history.replaceState(null, '', '/');
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={live}>
      <Link to="/tasks?view=board">보드</Link>
    </PlatformProvider></I18nProvider>);
    expect(new URL(screen.getByRole('link', { name: '보드' }).getAttribute('href')!, 'http://x').pathname).toBe('/feedbackops/tasks');
  });
});
