// #1887: a 401 on submit keeps the typed VOC for the same user's next session; another user never sees it.
import { configureApiClient } from '@/lib/api/client';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { beginSessionDraftOwner, resetSessionDraftsForTests, snapshotSessionDrafts } from '@/lib/session-draft/registry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VocComposeScreen } from '../VocComposeScreen';

vi.mock('@ap/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ap/ui')>()),
  RichEditor: ({ onChange }: { onChange: (doc: unknown) => void }) => (
    <textarea
      data-testid="mock-rich-editor"
      aria-label="상세 설명"
      onChange={(e) => onChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }] })}
    />
  ),
}));

const MS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MS_ITEM = {
  id: MS_ID, workspace_id: 'ws-1', slug: 'analytics', name: 'Analytics MS', external_key: null,
  default_owner_actor_id: null, default_owner_team_id: null, default_reviewer_actor_id: null, default_reviewer_team_id: null,
  archived_at: null, archived_by_actor_id: null, created_at: '2026-05-20T00:00:00Z', updated_at: '2026-05-20T00:00:00Z',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let postStatus = 401;
const posts: unknown[] = [];
const originalFetch = globalThis.fetch;
const draftKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith('draft:'));

beforeEach(() => {
  sessionStorage.clear();
  resetSessionDraftsForTests();
  posts.length = 0;
  postStatus = 401;
  // The bridge's unauthorized handling snapshots the drafts for the session's user before it retires the subtree.
  configureApiClient({ basePath: '/api/features', onUnauthorized: () => snapshotSessionDrafts('u1') });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname;
    if (path === '/api/features/managed-systems') return json({ items: [MS_ITEM], total: 1 });
    if (path === '/api/features/analytics-areas') return json({ items: [], total: 0 });
    if (path === '/api/features/vocs' && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return postStatus === 401 ? json({ code: 'auth.unauthenticated', message: 'x' }, 401) : json({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', display_id: 'VOC-7' }, 201);
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  configureApiClient({ basePath: '' });
  sessionStorage.clear();
});

function mount() {
  const seam = { canLink: () => false, Link: () => null, notifyError: vi.fn(), notifySuccess: vi.fn(), notify: vi.fn(() => 'id'), dismiss: vi.fn() } satisfies HostSeam;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <VocComposeScreen contextBlock={{ items: [], href: null }} initialManagedSystemId={null} onSubmitted={vi.fn()} onCancel={vi.fn()} onDirtyChange={vi.fn()} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  return { seam, view };
}

const submit = async () => {
  await waitFor(() => expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
};

async function typeAndExpire() {
  const first = mount();
  fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), { target: { value: '차트가 비어 있습니다' } });
  fireEvent.change(screen.getByTestId('mock-rich-editor'), { target: { value: '재현 절차' } });
  fireEvent.click(await screen.findByRole('radio', { name: 'Analytics MS' }));
  await submit();
  await waitFor(() => expect(draftKeys()).toEqual(['draft:u1:voc-compose']));
  // The bridge retires the subtree on the 401.
  first.view.unmount();
}

describe('<VocComposeScreen> session-expiry draft (#1887)', () => {
  it('keeps nothing while the session is healthy', async () => {
    mount();
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), { target: { value: '입력 중' } });
    await screen.findByRole('radio', { name: 'Analytics MS' });
    expect(draftKeys()).toEqual([]);
  });

  it('a 401 on submit, then the same user signs in again: title, body and system come back with one notice', async () => {
    await typeAndExpire();
    beginSessionDraftOwner('u1');
    postStatus = 201;
    const { seam } = mount();
    await waitFor(() => expect(screen.getByRole('textbox', { name: /제목/ })).toHaveValue('차트가 비어 있습니다'));
    expect(seam.notify).toHaveBeenCalledWith({ tone: 'info', message: '세션이 만료되어 작성 중이던 내용을 복원했습니다' });
    expect(draftKeys()).toEqual([]);
    await submit();
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toMatchObject({
      title: '차트가 비어 있습니다',
      primary_managed_system_id: MS_ID,
      description_rich_content: { content: [{ type: 'paragraph', content: [{ type: 'text', text: '재현 절차' }] }] },
    });
  });

  it('another user signing in gets an empty form and the draft is deleted', async () => {
    await typeAndExpire();
    beginSessionDraftOwner('u2');
    expect(draftKeys()).toEqual([]);
    const { seam } = mount();
    await screen.findByRole('radio', { name: 'Analytics MS' });
    expect(screen.getByRole('textbox', { name: /제목/ })).toHaveValue('');
    expect(seam.notify).not.toHaveBeenCalled();
  });
});
