import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { mountAt, warmPages } from '../test-support';

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

/** The existing Managed System picker is a double that records what the page hands it; the page owns no second picker, state or store. */
const picker = vi.hoisted(() => ({ props: [] as { value?: string; disabled?: boolean; onChange: (id: string | undefined) => void }[] }));
vi.mock('@ap/feature-screens/operator-screens/scope-picker', () => ({
  ManagedSystemScopeControl: (props: { value?: string; disabled?: boolean; onChange: (id: string | undefined) => void }) => {
    picker.props.push(props);
    return <div data-testid="picker" data-value={props.value ?? ''} />;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/task-list', () => ({ TaskListScreen: () => <div data-testid="list" /> }));

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  picker.props.length = 0;
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  await warmPages();
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('내 Task 목록 범위 (page-owned, #1099c B02)', () => {
  it('shows the carried managedSystem as the picker value and nothing as 전체', async () => {
    mountAt(`/my-tasks?managedSystem=${SYSTEM}`);
    expect((await screen.findByTestId('picker')).getAttribute('data-value')).toBe(SYSTEM);
    cleanup();
    mountAt('/my-tasks');
    expect((await screen.findByTestId('picker')).getAttribute('data-value')).toBe('');
  });

  it('clears with 전체 and replaces with another system on the same page key, as a replace (no history step) and keeping other filters', async () => {
    const before = window.history.length;
    mountAt(`/my-tasks?q=pump&managedSystem=${SYSTEM}`);
    await screen.findByTestId('picker');
    act(() => { picker.props.at(-1)!.onChange(OTHER); });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('managedSystem')).toBe(OTHER));
    act(() => { picker.props.at(-1)!.onChange(undefined); });
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('managedSystem')).toBe(false));
    expect(new URLSearchParams(window.location.search).get('q')).toBe('pump');
    expect(window.history.length).toBe(before);
  });

  it('does not draw the picker on the operator Task list, and rejects an invalid managedSystem before any picker mounts', async () => {
    mountAt(`/operations/task-list?managedSystem=${SYSTEM}`);
    await screen.findByTestId('list');
    expect(screen.queryByTestId('picker')).toBeNull();
    cleanup();
    picker.props.length = 0;
    mountAt('/my-tasks?managedSystem=not-a-uuid');
    await waitFor(() => expect(screen.queryByTestId('list')).toBeNull());
    expect(screen.queryByTestId('picker')).toBeNull();
    expect(picker.props).toEqual([]);
    expect(new URLSearchParams(window.location.search).get('managedSystem')).toBe('not-a-uuid');
  });
});
