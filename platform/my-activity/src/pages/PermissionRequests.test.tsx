import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/feature-bridge/fo-api';
import { mountAt, stubFetch, switchableAdapter } from '../fo/test-support';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/permission-requests');
});
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Permission requests without a FeedbackOps API (mock preview)', () => {
  it('C1 shows 실서버 필요, mounts nothing from FeedbackOps and requests nothing', async () => {
    setFoApi(null);
    const calls = stubFetch(() => new Response('{}'));
    mountAt(switchableAdapter().adapter, '/permission-requests');
    expect(await screen.findByRole('heading', { name: '권한 요청' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('permission-requests')).toBeNull();
    expect(calls).toEqual([]);
  });
});
