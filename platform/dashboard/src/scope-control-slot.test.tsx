import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { scopeControlSlot } from '@ap/feature-bridge/scope-control';
import { mountAt, registry } from './test-support';

const DASHBOARD = registry.menuById('dashboard');

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('scopeControlSlot', () => {
  it('returns one stable component for an operator menu, whichever space id the Kernel passes', () => {
    const first = scopeControlSlot.For(spaceId('flow'), DASHBOARD);
    expect(first).not.toBeNull();
    expect(scopeControlSlot.For(spaceId('flow'), DASHBOARD)).toBe(first);
    expect(scopeControlSlot.For(spaceId('bravo'), DASHBOARD)).toBe(first);
  });

  it.each<[string, MenuEntry | null]>([
    ['no current menu', null],
    ['a platform administration menu (group admin, no managedSystem key)', ({ ...DASHBOARD, id: 'admin-roles', group: groupId('admin'), pageKeys: [] }) as MenuEntry],
    ['the global 내 Task menu (group myActivity; its scope is page-owned)', ({ ...DASHBOARD, id: 'my-tasks', group: groupId('myActivity') }) as MenuEntry],
    ['an access menu (group access, 운영 콘솔 space)', ({ ...DASHBOARD, id: 'permission-grants', group: groupId('access') }) as MenuEntry],
    ['an operator menu without the managedSystem key', ({ ...DASHBOARD, pageKeys: [] }) as MenuEntry],
  ])('mounts nothing for %s', (_, menu) => {
    expect(scopeControlSlot.For(spaceId('flow'), menu)).toBeNull();
  });

  it('in the mock preview draws the 시스템 label and a disabled 전체 button titled 실서버 필요', () => {
    const Control = scopeControlSlot.For(spaceId('flow'), DASHBOARD)!;
    mountAt('/flow/dashboard', { extra: <Control collapsed={false} /> });
    expect(screen.getByTestId('scope-label').textContent).toBe('시스템');
    const button = screen.getByRole('button', { name: /전체/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('실서버 필요');
  });

  it('draws nothing when collapsed, and nothing off a menu without the managedSystem page key', () => {
    const Control = scopeControlSlot.For(spaceId('flow'), DASHBOARD)!;
    mountAt('/flow/dashboard', { extra: <Control collapsed /> });
    expect(screen.queryByTestId('scope-label')).toBeNull();
    cleanup();
    mountAt('/nowhere', { extra: <Control collapsed={false} /> });
    expect(screen.queryByTestId('scope-label')).toBeNull();
  });
});
