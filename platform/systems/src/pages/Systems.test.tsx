import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { featureQueryClient } from '@ap/feature-bridge';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { mountAt, warmPages } from '../test-support';

const PLATFORM = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const LINKED = '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const GONE = '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
const LOST = '9a8b7c6d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
const MANUAL = '1a2b3c4d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const system = (id: string, name: string, archived = false) => ({ id, workspace_id: 'w', slug: id, name, external_key: null, archived_at: archived ? '2026-01-01T00:00:00Z' : null });

// Page size 500 in production; the fixture holds three rows per page so the walk crosses pages.
const ALL = [system(LINKED, '운영 시스템'), system(GONE, 'Gone system', true), system(PLATFORM, '플랫폼'), system(MANUAL, 'Tableau 사이트'), system(LOST, 'Lost')];
const LINKS = {
  items: [
    { space_id: 'operations', managed_system_id: LINKED, declared: true },
    { space_id: 'gone-space', managed_system_id: GONE, declared: false },
  ],
  platform_managed_system_id: PLATFORM,
};

let requests: string[] = [];
function stub(over: { links?: () => Response; systems?: (offset: number) => Response } = {}) {
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    requests.push(path);
    if (path === '/api/features/managed-systems/space-links') return over.links?.() ?? json(LINKS);
    if (path.startsWith('/api/features/managed-systems?')) {
      const offset = Number(new URL(path, 'http://x').searchParams.get('offset'));
      return over.systems?.(offset) ?? json({ items: ALL.slice(offset, offset + 500), total: ALL.length });
    }
    return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  }));
}

beforeAll(warmPages, 60_000);
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); featureQueryClient.clear(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const withApi = (onSessionLost = vi.fn()) => { setFeatureApi({ basePath: '/api/features', onSessionLost }); return onSessionLost; };
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('시스템 screen without a feature API (mock preview)', () => {
  it('shows 실서버 필요 and requests nothing', async () => {
    stub();
    mountAt('/operations/systems');
    await screen.findByRole('heading', { name: '시스템' }, LAZY_MOUNT_WAIT);
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(requests).toEqual([]);
  });
});

describe('시스템 screen', () => {
  it('shows a loading state, then one row per link, 「플랫폼」 and each hand-registered system', async () => {
    withApi();
    stub();
    mountAt('/operations/systems');
    await screen.findByRole('heading', { name: '시스템' }, LAZY_MOUNT_WAIT);
    const table = await screen.findByRole('table', {}, LAZY_MOUNT_WAIT);
    expect([...table.querySelectorAll('tbody tr')].map(row => row.getAttribute('data-kind'))).toEqual(['platform', 'space', 'space', 'manual', 'manual']);
    expect(within(rowOf('플랫폼')).getByText('플랫폼 기본')).toBeTruthy();
    expect(within(rowOf('운영 시스템')).getByText('운영 콘솔')).toBeTruthy();
    expect(within(rowOf('운영 시스템')).getByText('연결됨')).toBeTruthy();
  });

  it('marks a link the space stopped declaring as 연결 끊김 (an archived system included) and names a space the Registry lacks by its id', async () => {
    withApi();
    stub();
    mountAt('/operations/systems');
    await screen.findByRole('table', {}, LAZY_MOUNT_WAIT);
    const gone = rowOf('Gone system');
    expect(within(gone).getByText('연결 끊김')).toBeTruthy();
    expect(within(gone).getByText('보관됨')).toBeTruthy();
    expect(within(gone).getByText('gone-space')).toBeTruthy();
    expect(within(gone).getByText('등록되지 않은 업무 시스템')).toBeTruthy();
  });

  it('badges a system registered by hand without a space as 플랫폼 밖, and keeps linked systems and an unlinked archived row out of that set', async () => {
    withApi();
    stub();
    mountAt('/operations/systems');
    await screen.findByRole('table', {}, LAZY_MOUNT_WAIT);
    expect(within(rowOf('Tableau 사이트')).getByText('플랫폼 밖')).toBeTruthy();
    expect(screen.getAllByText('플랫폼 밖')).toHaveLength(2); // Tableau, Lost
    expect(within(rowOf('운영 시스템')).queryByText('플랫폼 밖')).toBeNull();
  });

  it('walks every page of GET /managed-systems (archived included) when the server answers fewer rows than total', async () => {
    withApi();
    stub({ systems: offset => json({ items: ALL.slice(offset, offset + 3), total: ALL.length }) });
    mountAt('/operations/systems');
    await screen.findByRole('table', {}, LAZY_MOUNT_WAIT);
    expect(requests.filter(path => path.startsWith('/api/features/managed-systems?'))).toEqual([
      '/api/features/managed-systems?include_archived=true&limit=500&offset=0',
      '/api/features/managed-systems?include_archived=true&limit=500&offset=3',
    ]);
    expect(within(rowOf('Lost')).getByText('플랫폼 밖')).toBeTruthy(); // a row from the second page
  });

  it('shows an error with a retry that reads again', async () => {
    withApi();
    let fail = true;
    stub({ links: () => fail ? json({ code: 'internal.unexpected', message: 'x' }, 500) : json(LINKS) });
    mountAt('/operations/systems');
    const alert = await screen.findByRole('alert', {}, { timeout: 10_000 });
    expect(alert.textContent).toContain('시스템을 불러오지 못했습니다');
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await screen.findByRole('table', {}, LAZY_MOUNT_WAIT);
    expect(screen.queryByRole('alert')).toBeNull();
  }, 20_000);

  it('shows an empty state when the server has no system at all', async () => {
    withApi();
    stub({ links: () => json({ items: [], platform_managed_system_id: null }), systems: () => json({ items: [], total: 0 }) });
    mountAt('/operations/systems');
    const status = await screen.findByText('등록된 시스템이 없습니다', {}, LAZY_MOUNT_WAIT);
    expect(status).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('a 401 asks the host to sign in again', async () => {
    const onSessionLost = withApi();
    stub({ links: () => json({ code: 'auth.unauthenticated', message: 'x' }, 401) });
    mountAt('/operations/systems');
    await waitFor(() => expect(onSessionLost).toHaveBeenCalled(), LAZY_MOUNT_WAIT);
  });
});

