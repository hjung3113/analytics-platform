import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spaceId } from '@ap/contracts';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { scopeControlSlot } from '@ap/fo-bridge/scope-control';
import { mountAt } from './test-support';

const picker = vi.hoisted(() => ({ props: [] as { value?: string }[] }));
vi.mock('@fops/frontend/operator-screens/scope-picker', () => ({
  ManagedSystemScopeControl: (props: { value?: string }) => { picker.props.push(props); return <div data-testid="picker" />; },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); picker.props.length = 0; setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('목록 범위 picker (ready session)', () => {
  const Control = scopeControlSlot.For(spaceId('feedbackops'))!;

  it('gets a uuid managedSystem as its value', async () => {
    mountAt(`/feedbackops?managedSystem=${SYSTEM}`, <Control collapsed={false} />);
    await screen.findByTestId('picker');
    expect(picker.props.at(-1)?.value).toBe(SYSTEM);
  });

  it.each(['not-a-uuid', ''])('does not pass the invalid managedSystem %j to the picker as a selection', async value => {
    mountAt(`/feedbackops?managedSystem=${value}`, <Control collapsed={false} />);
    await screen.findByTestId('picker');
    await waitFor(() => expect(picker.props.length).toBeGreaterThan(0));
    expect(picker.props.every(props => props.value === undefined)).toBe(true);
  });
});
