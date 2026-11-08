import { cleanup, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { resetFeatureSessionForTests } from '@ap/feature-bridge/testing';
import { mountAt } from '../test-support';

const request = vi.fn();
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  resetFeatureSessionForTests(); setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  request.mockReset().mockImplementation(async (input: RequestInfo | URL) => String(input).includes('/actors') ? json({ actors: [], teams: [] }) : json({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', request);
});
afterEach(() => { cleanup(); setFeatureApi(null); resetFeatureSessionForTests(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
const listUrls = () => request.mock.calls.map(([input]) => new URL(String(input), 'http://x')).filter(url => url.pathname.endsWith('/api-tokens/service'));

describe('service token URL filters (B7, B8)', () => {
  it('defaults to service tokens and includes personal tokens only when requested', async () => {
    mountAt('/operations/service-tokens');
    await screen.findByTestId('service-tokens', undefined, { timeout: 5000 });
    await waitFor(() => expect(listUrls().at(-1)?.searchParams.get('kind')).toBe('service'));
    fireEvent.click(screen.getByRole('checkbox', { name: '개인 토큰 포함' }));
    await waitFor(() => expect(listUrls().at(-1)?.searchParams.has('kind')).toBe(false));
    expect(new URL(location.href).searchParams.get('kind')).toBe('all');
    fireEvent.click(screen.getByRole('checkbox', { name: '무기한 토큰' }));
    await waitFor(() => expect(new URL(location.href).searchParams.get('noExpiry')).toBe('true'));
    expect(new URL(location.href).searchParams.get('kind')).toBe('all');
  });
  it.each(['all', 'service'])('restores copied/refreshed noExpiry and kind=%s filters', async kind => {
    const link = `/operations/service-tokens?noExpiry=true&kind=${kind}`;
    const mounted = mountAt(link);
    await screen.findByTestId('service-tokens', undefined, { timeout: 5000 });
    await waitFor(() => expect(listUrls().at(-1)?.searchParams.get('noExpiry')).toBe('true'));
    expect(listUrls().at(-1)?.searchParams.get('kind')).toBe(kind === 'all' ? null : kind);
    mounted.unmount();
    mountAt(link);
    const noExpiry = await screen.findByRole('checkbox', { name: '무기한 토큰' });
    expect(noExpiry.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: '개인 토큰 포함' }).getAttribute('aria-checked')).toBe(kind === 'all' ? 'true' : 'false');
  });
});
