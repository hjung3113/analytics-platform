import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceId } from '@ap/contracts';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { scopeControlSlot } from '@ap/feature-bridge/scope-control';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { manifests } from './index';
import { mountAt } from './test-support';

type PickerProps = { capability?: string; onChange: (id: string | undefined) => void };
const picker = vi.hoisted(() => ({ props: [] as PickerProps[] }));
vi.mock('@ap/feature-screens/operator-screens/scope-picker', () => ({
  ManagedSystemScopeControl: (props: PickerProps) => { picker.props.push(props); return <div data-testid="picker" />; },
}));

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); picker.props.length = 0; setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });
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
