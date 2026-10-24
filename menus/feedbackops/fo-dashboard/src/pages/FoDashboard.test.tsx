import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { foQueryClient } from '@ap/fo-bridge';
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
