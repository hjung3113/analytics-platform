// #1887: the token issue form keeps only name, scopes and expiry across a session expiry, never the issued token value.
import { configureApiClient } from '@/lib/api/client';
import { HostSeamProvider } from '@/lib/host/host-seam';
import { beginSessionDraftOwner, resetSessionDraftsForTests, snapshotSessionDrafts } from '@/lib/session-draft/registry';
import type { ApiTokenItem } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiTokensScreen, type ApiTokenDrawerParts, type ApiTokenTableParts } from '../ApiTokensScreen';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRET = `ap_12345678_${'s'.repeat(43)}`;
const row: ApiTokenItem = {
  id: ID, kind: 'personal', name: '분석 스크립트', prefix: '12345678', scopes: ['workspace.read'], expiresAt: null, lastUsedAt: null, lastUsedIp: null,
  revokedAt: null, createdAt: '2026-10-01T00:00:00Z', createdBy: ACTOR, actorId: ACTOR, unusedWarning: false,
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const draftKeys = () => Object.keys(sessionStorage).filter(key => key.startsWith('draft:'));

function Table(parts: ApiTokenTableParts) {
  return <table aria-label="토큰 목록"><tbody>{parts.rows.map(r => <tr key={r.id}>{parts.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}</tr>)}</tbody></table>;
}
function Drawer(parts: ApiTokenDrawerParts) {
  return <section role="dialog" aria-label={String(parts.title)}><button type="button" onClick={parts.requestClose}>상세 닫기</button>{parts.body}{parts.footer}</section>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <HostSeamProvider value={{ canLink: () => false, Link: ({ children }) => <span>{children}</span>, notifyError: vi.fn(), notifySuccess: vi.fn(), useSearch: () => ({}), useNavigate: () => () => undefined }}>
      <ApiTokensScreen service={false} canManageService renderTable={Table} renderDrawer={Drawer} />
    </HostSeamProvider>
  </QueryClientProvider>);
}
async function openIssue() {
  const user = userEvent.setup();
  await screen.findByRole('table');
  await user.click(screen.getByRole('button', { name: '토큰 발급' }));
  return user;
}

beforeEach(() => {
  sessionStorage.clear();
  resetSessionDraftsForTests();
  configureApiClient({ basePath: '/api/features' });
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (init?.method === 'POST' ? json({ token: SECRET, item: row }, 201) : json({ items: [row], nextCursor: null }))));
});
afterEach(() => { configureApiClient({ basePath: '' }); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('TokenIssueDrawer session-expiry draft (#1887)', () => {
  it('the same user\'s next session gets the name and expiry back', async () => {
    const first = mount();
    const user = await openIssue();
    await user.type(screen.getByLabelText('토큰 이름'), '새 토큰');
    await user.click(screen.getByRole('radio', { name: '30일' }));
    snapshotSessionDrafts('u1');
    expect(JSON.parse(sessionStorage.getItem('draft:u1:api-token-issue:personal') ?? '{}').value).toMatchObject({ name: '새 토큰', expiry: '30' });
    first.unmount();
    beginSessionDraftOwner('u1');

    mount();
    await openIssue();
    await waitFor(() => expect(screen.getByLabelText('토큰 이름')).toHaveValue('새 토큰'));
    expect(screen.getByRole('radio', { name: '30일' })).toBeChecked();
    expect(draftKeys()).toEqual([]);
  });

  it('never keeps the issued token value: once it is shown nothing is stored', async () => {
    mount();
    const user = await openIssue();
    await user.type(screen.getByLabelText('토큰 이름'), '새 토큰');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '토큰 발급' }));
    expect(await screen.findByDisplayValue(SECRET)).toBeVisible();
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual([]);
    expect(JSON.stringify(sessionStorage)).not.toContain(SECRET);
  });

  it('cancel discards the form and keeps nothing', async () => {
    mount();
    const user = await openIssue();
    await user.type(screen.getByLabelText('토큰 이름'), '새 토큰');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual([]);
  });
});
