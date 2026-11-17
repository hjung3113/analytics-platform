import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PermissionGroupsScreen } from '../permission-groups-screen';
import { configureApiClient } from '../../../../lib/api/client';

vi.mock('../../../../lib/host/useHostSearchWriter', () => ({ useHostSearchWriter: () => {
  const [search, setSearch] = useState<Record<string, unknown>>({});
  return { search, write: setSearch };
} }));
vi.mock('@ap/ui', async importOriginal => ({ ...(await importOriginal<typeof import('@ap/ui')>()), ListShell: ({ tabs, list, detailPanel }: { tabs: ReactNode; list: ReactNode; detailPanel: ReactNode }) => <main>{tabs}{list}{detailPanel}</main> }));

const group = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '운영 조회', description: '목록 설명', kind: 'operator', owner: { actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: '작성자' }, capabilities: ['workspace.read'], shared_with: [], grant_count: 2, can_edit: true, updated_at: '2026-11-17T00:00:00.000Z' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); configureApiClient({ basePath: '' }); });

it('reads detail before edit, reloads a stale write, and filters operator/personal tabs', async () => {
  let detailReads = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('declared-capabilities')) return json({ items: [] });
    if (url === '/permission-groups?scope=all') return json({ items: [group, { ...group, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: '개인 조회', kind: 'personal' }] });
    if (url === `/permission-groups/${group.id}` && init?.method === 'PATCH') return json({ code: 'conflict.stale_write', message: 'stale' }, 409);
    if (url === `/permission-groups/${group.id}`) { detailReads += 1; return json({ ...group, description: `상세 설명 ${detailReads}`, updated_at: `2026-11-17T00:00:0${detailReads}.000Z` }); }
    throw new Error(url);
  });
  vi.stubGlobal('fetch', fetch);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PermissionGroupsScreen /></QueryClientProvider>);
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /운영자/ }));
  expect(screen.queryByText('개인 조회')).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /개인/ }));
  expect(screen.queryByText('운영 조회')).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /전체/ }));
  fireEvent.click(screen.getByText('운영 조회'));
  expect(await screen.findByText('상세 설명 1')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '이름' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '고치기' }));
  expect(screen.getByRole('textbox', { name: '설명' })).toHaveValue('상세 설명 1');
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(detailReads).toBeGreaterThan(1));
  expect(await screen.findByText('상세 설명 2')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('요청이 바뀌었습니다');
  expect(JSON.parse(String(fetch.mock.calls.find(call => call[1]?.method === 'PATCH')?.[1]?.body))).toMatchObject({ expected_updated_at: '2026-11-17T00:00:01.000Z' });
});
