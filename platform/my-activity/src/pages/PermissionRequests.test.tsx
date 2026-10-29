import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { mountAt, stubFetch, switchableAdapter } from '../feature/test-support';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/permission-requests');
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Permission requests without a feature API (mock preview)', () => {
  it('C1 shows 실서버 필요, mounts nothing from feature and requests nothing', async () => {
    setFeatureApi(null);
    const calls = stubFetch(() => new Response('{}'));
    mountAt(switchableAdapter().adapter, '/permission-requests');
    expect(await screen.findByRole('heading', { name: '권한 요청' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('permission-requests')).toBeNull();
    expect(calls).toEqual([]);
  });
});
