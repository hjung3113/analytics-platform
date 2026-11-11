import { useState, type ReactNode } from 'react';
import { configureApiClient } from '@/lib/api/client';
import { HostSeamProvider } from '@/lib/host/host-seam';
import type { ApiTokenItem } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiTokensScreen, type ApiTokenTableParts, type ApiTokenDrawerParts } from '../ApiTokensScreen';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRET = `ap_12345678_${'s'.repeat(43)}`;
const row = (over: Partial<ApiTokenItem> = {}): ApiTokenItem => ({
  id: ID, kind: 'personal', name: '분석 스크립트', prefix: '12345678', scopes: ['workspace.read'],
  expiresAt: null, lastUsedAt: '2026-11-01T01:00:00Z', lastUsedIp: '10.0.0.1', revokedAt: null,
  createdAt: '2026-10-01T00:00:00Z', createdBy: ACTOR, actorId: ACTOR, unusedWarning: false, ...over,
});
let rows: ApiTokenItem[];
let nextCursor: string | null;
let issueError: unknown;
let issueErrorStatus: number;
let client: QueryClient;
let calls: { path: string; method: string; body: unknown }[];
const notices = vi.fn();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function Table(parts: ApiTokenTableParts) {
  return <><p>{parts.summary}</p><table aria-label="토큰 목록"><thead><tr>{parts.columns.map(c => <th key={c.id}>{c.header}</th>)}<th>동작</th></tr></thead><tbody>{parts.rows.map(r => <tr key={r.id}>{parts.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}<td>{parts.rowAction(r)}</td></tr>)}</tbody></table>{parts.pagination}</>;
}
function Drawer(parts: ApiTokenDrawerParts) {
  return <section role="dialog" aria-label={String(parts.title)}><h2>{parts.title}</h2><button type="button" onClick={parts.requestClose}>상세 닫기</button>{parts.body}</section>;
}
function TestHost({ children }: { children: ReactNode }) {
  const [search, setSearch] = useState<Record<string, string>>({});
  return <HostSeamProvider value={{ canLink: () => false, Link: ({ children }) => <span>{children}</span>, notifyError: notices, notifySuccess: notices, useSearch: () => search, useNavigate: () => to => setSearch(Object.fromEntries(new URL(to, 'http://x').searchParams)) }}>{children}</HostSeamProvider>;
}
function mount(service = false, canManageService = true) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TestHost>
    <ApiTokensScreen service={service} canManageService={canManageService} renderTable={Table} renderDrawer={Drawer} />
  </TestHost></QueryClientProvider>);
}
async function openIssue() {
  const user = userEvent.setup();
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: '토큰 발급' }));
  await user.type(screen.getByLabelText('토큰 이름'), '새 토큰');
  return user;
}
beforeEach(() => {
  configureApiClient({ basePath: '/api/features' });
  rows = [row()]; nextCursor = null; issueError = undefined; issueErrorStatus = 422; calls = []; notices.mockClear();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ path, method, body });
    if (path.includes('/actors?')) return json({ actors: [{ id: ACTOR, display_name: '검증 워커', email: 'system@example.test', role_level: 'user', actor_type: 'system' }] });
    if (method === 'POST' && path.endsWith('/revoke')) { rows = rows.map(r => row({ ...r, revokedAt: '2026-11-07T00:00:00Z' })); return json({ item: rows[0] }); }
    if (method === 'POST') {
      if (issueError) return json(issueError, issueErrorStatus);
      rows = [row({ name: '새 토큰' }), ...rows.filter(r => r.id !== ID)];
      return json({ token: SECRET, item: rows[0] }, 201);
    }
    return json({ items: rows, nextCursor });
  }));
});
afterEach(() => { cleanup(); client?.clear(); configureApiClient({ basePath: '' }); vi.unstubAllGlobals(); });

describe('API token management', () => {
  it('renders unused, revoked, no-expiry, expired and unmapped scopes without actions on revoked rows', async () => {
    rows = [row({ unusedWarning: true }), row({ id: ACTOR, name: '폐기한 토큰', revokedAt: '2026-11-01T00:00:00Z', scopes: ['workspace.read', 'voc.read'] }), row({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: '만료 토큰', expiresAt: '2020-01-01T00:00:00Z' })];
    mount();
    expect(await screen.findByText('30일 이상 미사용')).toBeVisible();
    expect(screen.getAllByText('무기한')).toHaveLength(2);
    expect(screen.getByText('폐기됨')).toBeVisible();
    expect(screen.getByText('만료됨')).toBeVisible();
    expect(screen.getByText('workspace.read · voc.read')).toBeVisible();
    expect(within(screen.getByText('폐기한 토큰').closest('tr') as HTMLElement).queryByRole('button')).toBeNull();
    expect(screen.getAllByText('10.0.0.1')).toHaveLength(3);
  });
  it('unions selected bundles; keeps the one-time value out of caches, URLs, storage and notices; confirms close', async () => {
    mount(); const user = await openIssue();
    expect(screen.queryByRole('checkbox', { name: /검증 작업자/ })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /^기록/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    expect(await screen.findByDisplayValue(SECRET)).toBeVisible();
    const post = calls.find(c => c.method === 'POST');
    expect(post?.body).toMatchObject({ name: '새 토큰', scopes: ['workspace.read', 'knowledge.catalog.manage', 'knowledge.catalog.import', 'improvement.manage'] });
    const expiresAt = (post?.body as { expiresAt: string }).expiresAt;
    expect(Math.abs(new Date(expiresAt).getTime() - Date.now() - 90 * 86400000)).toBeLessThan(5000);
    expect(screen.getByRole('button', { name: '토큰 발급' })).toBeDisabled();
    expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data))).not.toContain(SECRET);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(location.href + JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain(SECRET);
    expect(JSON.stringify(notices.mock.calls)).not.toContain(SECRET);
    await user.click(screen.getByRole('button', { name: '상세 닫기' }));
    await user.click(screen.getByRole('button', { name: '계속 보기' }));
    expect(screen.getByDisplayValue(SECRET)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '상세 닫기' }));
    await user.click(screen.getByRole('button', { name: '토큰 값 닫기' }));
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
    await user.click(screen.getByRole('button', { name: '토큰 발급' }));
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
  });
  it.each(['30', '90', 'custom', 'never'])('sends the %s expiry and warns only for no expiry', async mode => {
    mount(); const user = await openIssue();
    const label = { '30': '30일', '90': '90일', custom: '날짜 지정', never: '무기한' }[mode] as string;
    await user.click(screen.getByRole('radio', { name: label }));
    if (mode === 'custom') await user.type(screen.getByLabelText('만료 날짜'), '2099-12-31');
    expect(screen.queryByText(/무기한 토큰은 폐기할 때까지/)).toBe(mode === 'never' ? screen.getByText(/무기한 토큰은 폐기할 때까지/) : null);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    await screen.findByDisplayValue(SECRET);
    const expiry = (calls.find(c => c.method === 'POST')?.body as { expiresAt: string | null }).expiresAt;
    if (mode === 'never') expect(expiry).toBeNull();
    else if (mode === 'custom') expect(expiry).toBe('2099-12-31T23:59:59+09:00');
    else expect(Math.abs(new Date(expiry as string).getTime() - Date.now() - Number(mode) * 86400000)).toBeLessThan(5000);
  });
  it('shows server detail.fields and the catalog error on the issue form', async () => {
    issueError = { code: 'validation.failed', message: 'invalid', detail: { fields: [{ path: 'name', code: 'too_big', message: '이름이 너무 깁니다' }] } };
    mount(); const user = await openIssue();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    expect(await screen.findByText('이름이 너무 깁니다')).toBeVisible();
    expect(screen.getByText('입력값이 올바르지 않습니다.')).toBeVisible();
    expect(screen.getByLabelText('토큰 이름')).toHaveValue('새 토큰');
  });
  it('copies only on explicit action and handles an unavailable clipboard', async () => {
    mount(); const user = await openIssue();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    await screen.findByDisplayValue(SECRET);
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    expect(write).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '복사' }));
    expect(write).toHaveBeenCalledWith(SECRET);
    expect(await screen.findByText('복사했습니다')).toBeVisible();
    write.mockRestore();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await user.click(screen.getByRole('button', { name: '복사' }));
    expect(await screen.findByText('복사하지 못했습니다. 토큰 값을 직접 복사해 주세요.')).toBeVisible();
  });
  it.each([
    [401, 'permission.session_required', '이 동작은 로그인 세션으로만 할 수 있습니다.'],
    [403, 'permission.denied', '권한이 없습니다.'],
  ])('maps issuance denial %s through the error catalog', async (status, code, message) => {
    issueError = { code, message: 'denied' }; issueErrorStatus = status;
    mount(); const user = await openIssue();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
  });
  it('asks before revoke, then refreshes the list', async () => {
    mount(); await screen.findByRole('table'); const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /분석 스크립트 폐기/ }));
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '토큰 폐기' }));
    expect(await screen.findByText('폐기됨')).toBeVisible();
    expect(calls.some(c => c.path.endsWith(`/${ID}/revoke`))).toBe(true);
  });
  it('loads system actors, issues for the selected actor, filters no-expiry and traverses keyset pages', async () => {
    nextCursor = 'opaque-next'; mount(true); const user = await openIssue();
    await user.click(screen.getByRole('radio', { name: '검증 워커' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    await screen.findByDisplayValue(SECRET);
    expect(calls.find(c => c.method === 'POST')?.body).toMatchObject({ actorId: ACTOR });
    await user.click(screen.getByRole('button', { name: '상세 닫기' }));
    await user.click(screen.getByRole('button', { name: '토큰 값 닫기' }));
    await user.click(screen.getByRole('checkbox', { name: '무기한 토큰' }));
    await waitFor(() => expect(calls.some(c => c.path.includes('noExpiry=true'))).toBe(true));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(calls.some(c => c.path.includes('cursor=opaque-next'))).toBe(true));
    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(calls.some(c => c.path.includes('actorType=system'))).toBe(true);
  });
  it('shows the service display gate without fetching for a non-admin', () => {
    mount(true, false);
    expect(screen.getByText('관리자만 서비스 토큰을 관리할 수 있습니다.')).toBeVisible();
    expect(calls).toHaveLength(0);
  });
  it('requires safe-storage acknowledgement before completing the secret drawer (B6)', async () => {
    mount(); const user = await openIssue();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    await screen.findByDisplayValue(SECRET);
    const done = screen.getByRole('button', { name: '완료 · 토큰 값 닫기' });
    expect(done).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '안전한 곳에 보관했습니다' }));
    expect(done).toBeEnabled();
    await user.click(done);
    await user.click(screen.getByRole('button', { name: '토큰 값 닫기' }));
    expect(screen.queryByDisplayValue(SECRET)).toBeNull();
  });
  it('resolves human and system row owners; unresolved identities never expose raw ids (B9)', async () => {
    const system = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const missing = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    rows = [row(), row({ id: system, kind: 'service', actorId: system }), row({ id: missing, actorId: missing })];
    const original = fetch;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/actors/resolve?')) return Promise.resolve(json({ actors: [{ id: ACTOR, display_name: '홍길동', email: 'human@example.test' }, { id: system, display_name: '서비스 워커', email: 'system@example.test' }], teams: [] }));
      return original(input, init);
    }));
    mount(true);
    expect(await screen.findByText('홍길동')).toBeVisible();
    expect(screen.getByText('서비스 워커')).toBeVisible();
    expect(screen.queryByText(missing)).toBeNull();
    expect(within(screen.getAllByRole('row')[3] as HTMLElement).getByText('—')).toHaveClass('text-text-muted');
    const request = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes('/actors/resolve?'));
    expect(new URL(String(request?.[0]), 'http://x').searchParams.get('actor_ids')?.split(',').sort()).toEqual([ACTOR, system, missing].sort());
  });
  it('offers the token-only 검증 작업자 bundle on the service screen and issues its scope', async () => {
    mount(true); const user = await openIssue();
    await user.click(screen.getByRole('radio', { name: '검증 워커' }));
    await user.click(screen.getByRole('checkbox', { name: /^검증 작업자/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    await screen.findByDisplayValue(SECRET);
    expect(calls.find(c => c.method === 'POST')?.body).toMatchObject({ scopes: ['workspace.read', 'validation.worker'], actorId: ACTOR });
  });
  it('offers first issuance without an orphan pager on the empty first page (B10)', async () => {
    rows = []; mount();
    expect(await screen.findByText('아직 발급한 토큰이 없습니다')).toBeVisible();
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '첫 토큰 발급' }));
    expect(screen.getByLabelText('토큰 이름')).toBeVisible();
  });

});
