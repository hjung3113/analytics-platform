import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PermissionRequestsScreen } from '../PermissionRequestsScreen';
import { SharePermissionGroupDialog } from '../../../admin/permissions/permission-group-parts';
import { configureApiClient } from '../../../../lib/api/client';
import { PermissionGroupCatalog } from '../PermissionGroupCatalog';
import { ownerDetailFixture } from '../../../../test/permission-details';

const group = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '조회 권한', description: null, kind: 'personal' as const, owner: { actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', display_name: '작성자' }, capabilities: ['workspace.read', 'workspace.admin', 'voc.read'], shared_with: [], grant_count: null, can_edit: true, updated_at: '2026-11-17T00:00:00.000Z' };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
function mount(node: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{node}</QueryClientProvider>);
}
afterEach(() => { vi.unstubAllGlobals(); configureApiClient({ basePath: '' }); });
it('catalog fills the existing picker, shows only missing capabilities and sends a one-item group batch', async () => {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes('declared-capabilities')) return json({ items: [] });
    if (url.startsWith('/managed-systems')) return json({ items: [], total: 0 });
    if (url === '/permission-groups') return json({ items: [group] });
    if (url.startsWith('/me/permissions/check')) return json({ state: 'request_access', decision: { allow: url.includes('voc.read') } });
    if (url === '/permission-requests/mine?status=all') return json({ requests: [] });
    if (url === '/permission-requests/batch') return json({ batch_id: group.id, items: [{ id: group.id, status: 'pending', created_at: group.updated_at }] });
    throw new Error(`Unexpected ${url}`);
  }));
  mount(<PermissionRequestsScreen />);
  fireEvent.click(await screen.findByRole('radio', { name: /조회 권한/ }));
  await screen.findByText(/빠짐:.*관리자.*신청할 수 없음.*이미 가짐/);
  const picker = screen.getByLabelText('기능', { selector: 'div[tabindex="-1"]' });
  expect(within(picker).getAllByRole('checkbox').filter(item => item.hasAttribute('aria-labelledby') && item.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText(/사유.*필수/), { target: { value: '업무에 필요합니다' } });
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }));
  await waitFor(() => expect(calls.find(call => call.url === '/permission-requests/batch')?.body).toEqual({ items: [{ requested_capability: 'workspace.read' }], reason: '업무에 필요합니다', permission_group_id: group.id }));
});

it('share dialog focuses the labelled name search, uses workspace actors and preserves the copy link', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ actors: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', display_name: '김하나', actor_type: 'human', role_level: 'user', email: '' }] })));
  mount(<SharePermissionGroupDialog group={group} link="https://platform.example/permission-requests?permissionGroup=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" onClose={vi.fn()} />);
  const search = screen.getByRole('searchbox', { name: '사람 이름으로 추가' });
  await waitFor(() => expect(search).toHaveFocus());
  fireEvent.change(search, { target: { value: '김하나' } });
  expect(await screen.findByRole('button', { name: '김하나 추가' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: '링크' })).toHaveValue('https://platform.example/permission-requests?permissionGroup=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});

it('reports a failed copy and enforces the sharing limit', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ actors: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', display_name: '김하나', actor_type: 'human', role_level: 'user', email: '' }] })));
  const shared_with = Array.from({ length: 50 }, (_, index) => ({ actor_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, display_name: `동료 ${index}` }));
  mount(<SharePermissionGroupDialog group={{ ...group, shared_with }} link="https://platform.example" onClose={vi.fn()} />);
  fireEvent.change(screen.getByRole('searchbox', { name: '사람 이름으로 추가' }), { target: { value: '김하나' } });
  expect(await screen.findByRole('button', { name: '김하나 추가' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '복사' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('링크를 복사하지 못했습니다.');
  expect(screen.queryByRole('button', { name: '복사함' })).not.toBeInTheDocument();
});

it.each(['invalid-id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'])('shows a plain unavailable notice for unknown share link %s', async linkId => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input) === '/permission-groups' ? json({ items: [] }) : new Response(JSON.stringify({ code: 'not_found.record', message: 'private server detail' }), { status: 404 })));
  mount(<PermissionGroupCatalog selected={null} requestable={[]} disabled={false} linkId={linkId} onPick={vi.fn()} />);
  expect(await screen.findByText('이 권한 그룹을 열 수 없습니다. 공유 대상인지 확인하세요.')).toBeInTheDocument();
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument();
});

it('recomputes held exclusions when the selected system changes', async () => {
  const onPick = vi.fn();
  const client = new QueryClient();
  const node = (system: string) => <QueryClientProvider client={client}><PermissionGroupCatalog selected={group.id} requestable={['workspace.read', 'voc.read']} managedSystemId={system} disabled={false} onPick={onPick} /></QueryClientProvider>;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/permission-groups') return json({ items: [group] });
    return json({ state: 'request_access', decision: { allow: url.includes('cccccccc-cccc-4ccc-8ccc-cccccccccccc') && url.includes('voc.read') } });
  }));
  const view = render(node('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
  await screen.findByRole('radio', { name: /조회 권한/ });
  view.rerender(node('cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
  await waitFor(() => expect(onPick).toHaveBeenCalledWith(group, ['workspace.read']));
  expect(screen.getByText(/빠짐:.*이미 가짐/)).toBeInTheDocument();
});

it('does not overwrite a manual picker edit with an in-flight catalog result', async () => {
  let finish: (response: Response) => void = () => { throw new Error('No check started'); };
  const onPick = vi.fn();
  const check = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input) === '/permission-groups' ? json({ items: [{ ...group, capabilities: ['workspace.read'] }] }) : check()));
  const client = new QueryClient();
  const node = (version: number) => <QueryClientProvider client={client}><PermissionGroupCatalog selected={null} selectionVersion={version} requestable={['workspace.read']} disabled={false} onPick={onPick} /></QueryClientProvider>;
  const view = render(node(0));
  fireEvent.click(await screen.findByRole('radio', { name: /조회 권한/ }));
  await waitFor(() => expect(check).toHaveBeenCalled());
  view.rerender(node(1));
  await act(async () => { finish(json({ state: 'request_access', decision: { allow: false } })); });
  expect(onPick).not.toHaveBeenCalled();
});

it('keeps requester batch members separate with per-row withdrawal and answers once for all revisions', async () => {
  const first = { ...ownerDetailFixture('needs_more_info'), batch_id: group.id, permission_group: { id: group.id, name: group.name } };
  const second = { ...first, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', requested_capability: 'workspace.read', revision: 8 };
  let answered = false;
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes('declared-capabilities')) return json({ items: [] });
    if (url.startsWith('/managed-systems')) return json({ items: [], total: 0 });
    if (url === '/permission-groups') return json({ items: [] });
    if (url === '/permission-requests/mine?status=all') return json({ requests: [first, second].map(row => ({ ...row, status: answered ? 'pending' : 'needs_more_info' })) });
    if (url.endsWith('/submit-more-info')) { answered = true; return new Response(null, { status: 204 }); }
    if (url.includes('/permission-requests/')) return json(first);
    throw new Error(url);
  }));
  mount(<PermissionRequestsScreen />);
  const answers = await screen.findAllByLabelText('추가 정보');
  expect(answers).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: /요청 철회:/ })).toHaveLength(2);
  expect(screen.getAllByText(/권한 그룹 «조회 권한»/)).toHaveLength(2);
  expect(screen.queryByText(/철회한 뒤/)).not.toBeInTheDocument();
  const answer = answers[0];
  const send = screen.getAllByRole('button', { name: '추가 정보 보내기' })[0];
  if (!answer || !send) throw new Error('Missing batch answer form');
  fireEvent.change(answer, { target: { value: '전체 요청의 답변입니다' } });
  fireEvent.click(send);
  await waitFor(() => expect(screen.queryByLabelText('추가 정보')).not.toBeInTheDocument());
  expect(calls.find(call => call.url.endsWith('/submit-more-info'))?.body).toEqual({ note: '전체 요청의 답변입니다', expected_revisions: { [first.id]: 7, [second.id]: 8 } });
});
