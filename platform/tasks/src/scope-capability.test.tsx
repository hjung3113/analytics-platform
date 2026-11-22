import { cleanup, screen, waitFor } from '@testing-library/react';
import { ClipboardList, UserRound } from 'lucide-react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceId } from '@ap/contracts';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { scopeControlSlot } from '@ap/feature-bridge/scope-control';
import { createFeatureMenuHarness, LAZY_MOUNT_WAIT, resetFeatureSessionForTests } from '@ap/feature-bridge/testing';
import { manifests } from './index';
import { mountAt, warmPages } from './test-support';

const SYSTEM = '33333333-3333-4333-8333-333333333333';

type PickerProps = { capability?: string; onChange: (id: string | undefined) => void };
const picker = vi.hoisted(() => ({ props: [] as PickerProps[] }));
vi.mock('@ap/feature-screens/operator-screens/scope-picker', () => ({
  ManagedSystemScopeControl: (props: PickerProps) => { picker.props.push(props); return <div data-testid="picker" />; },
}));

beforeAll(warmPages, 60_000);
beforeEach(() => { resetFeatureSessionForTests(); vi.stubGlobal('localStorage', memoryStorage()); picker.props.length = 0; setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

// #2632: the Task lists scope by `finding.manage` on the server, so the pickers mark «범위 밖» by it, not by the VOC default.
describe('목록 범위 capability on the Task menus', () => {
  it.each(['task-requests', 'tasks', 'task-list', 'milestones'])('passes finding.manage to the sidebar picker on %s', async id => {
    const menu = manifests.find(entry => entry.id === id)!;
    const Control = scopeControlSlot.For(spaceId('flow'), menu)!;
    mountAt(menu.path, { extra: <Control collapsed={false} /> });
    await screen.findByTestId('picker', undefined, LAZY_MOUNT_WAIT);
    expect(picker.props.at(-1)?.capability).toBe('finding.manage');
  });

  it('passes finding.manage to the page-owned picker on 내 Task', async () => {
    mountAt(manifests.find(entry => entry.id === 'my-tasks')!.path);
    await screen.findByTestId('picker', undefined, LAZY_MOUNT_WAIT);
    expect(picker.props.at(-1)?.capability).toBe('finding.manage');
  });
});

// #2697: Task 목록, Task 보드 and 마일스톤 read their empty-list permission check capability from the menu manifest.
describe('scoped empty-list capability on the Task screens', () => {
  it.each(['task-list', 'tasks', 'milestones'] as const)(
    'checks manifest requiredCapability.id instead of finding.manage on %s',
    async id => {
      const overridden = manifests.map(entry => ({ ...entry, requiredCapability: { id: 'task.other' } }));
      const myActivityStub = { ...overridden.find(entry => entry.id === 'my-tasks')!, id: 'my-activity-stub', primary: true, navHidden: true, path: '/my-activity-stub', pageKeys: [], carrySet: undefined };
      const custom = createFeatureMenuHarness({
        manifests: [...overridden, myActivityStub],
        homeMenuId: 'tasks',
        group: { id: 'tasks', label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList },
        globalGroups: [{ id: 'myActivity', label: { ko: '내 활동', en: 'My activity' }, icon: UserRound }],
      });
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname.endsWith('/me/permissions/check')) {
          return Response.json({ state: 'blocked_non_requestable', decision: { allow: false } });
        }
        if (url.pathname.endsWith('/milestones')) return Response.json({ items: [] });
        if (url.pathname.endsWith('/actors')) return Response.json({ actors: [] });
        if (url.pathname.endsWith('/tasks')) return Response.json({ items: [], page: { total: 0, has_more: false } });
        return Response.json({ items: [], total: 0 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const menu = overridden.find(entry => entry.id === id)!;
      custom.mountAt(`${menu.path}?managedSystem=${SYSTEM}`);

      const checkUrl = await waitFor(() => {
        const call = fetchMock.mock.calls.find(([input]) => new URL(String(input), 'http://localhost').pathname.endsWith('/me/permissions/check'));
        expect(call).toBeDefined();
        return new URL(String(call![0]), 'http://localhost');
      }, LAZY_MOUNT_WAIT);
      expect(checkUrl.searchParams.get('capability')).toBe('task.other');
      expect(checkUrl.searchParams.get('capability')).not.toBe('finding.manage');
      expect(checkUrl.searchParams.get('managed_system_id')).toBe(SYSTEM);
    },
  );
});
