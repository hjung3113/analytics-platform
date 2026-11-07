import { configureApiClient } from '@/lib/api/client';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VocComposeScreen } from '../VocComposeScreen';
const ATT_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ATT_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const MS_ITEM = {
  id: MS_ID,
  workspace_id: 'ws-1',
  slug: 'analytics',
  name: 'Analytics MS',
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  default_reviewer_actor_id: null,
  default_reviewer_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
};

let uploads: string[] = [];
let posted: { body: Record<string, unknown> } | undefined;
function installFetch(post: Response) {
  posted = undefined; uploads = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname;
    if (path === '/api/features/attachments' && init?.method === 'POST') {
      const file = (init.body as FormData).get('file') as File;
      uploads.push(file.name);
      return json({ id: file.type.startsWith('image/') ? ATT_A : ATT_B, name: file.name, size_bytes: file.size, mime_type: file.type, uploaded_by_actor_id: MS_ID, created_at: '2026-05-20T00:00:00Z' }, 201);
    }
    if (path === '/api/features/managed-systems') return json({ items: [MS_ITEM], total: 1 });
    if (path === '/api/features/analytics-areas') return json({ items: [], total: 0 });
    if (path === '/api/features/vocs' && init?.method === 'POST') {
      posted = { body: JSON.parse(String(init.body)) as Record<string, unknown> };
      return post.clone();
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
}

const onUnauthorized = vi.fn();
function mount() {
  const seam = {
    canLink: () => false,
    Link: () => null,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  } satisfies HostSeam;
  const props = {
    contextBlock: { items: [], href: null },
    initialManagedSystemId: null,
    onSubmitted: vi.fn(),
    onCancel: vi.fn(),
    onDirtyChange: vi.fn(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <VocComposeScreen {...props} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  return { seam, props };
}
const originalFetch = globalThis.fetch;
beforeEach(() => { configureApiClient({ basePath: '/api/features', onUnauthorized }); });
afterEach(() => { globalThis.fetch = originalFetch; configureApiClient({ basePath: '' }); });
describe('VOC compose shared editor upload queue', () => {
  it('pasted images and non-images upload once, appear in the list and submit both ids with an id-only inline image', async () => {
    installFetch(json({ id: 'v', display_id: 'VOC-7' }, 201));
    const { props } = mount();
    const editor = await screen.findByRole('textbox', { name: '상세 설명' });
    fireEvent.paste(editor, { clipboardData: { files: [new File(['image'], '화면.png', { type: 'image/png' }), new File(['log'], 'log.txt', { type: 'text/plain' })], items: [], getData: () => '' } });
    await waitFor(() => expect(uploads).toEqual(['화면.png', 'log.txt']));
    expect(await screen.findByText('화면.png')).toBeInTheDocument();
    expect(await screen.findByText('log.txt')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.ProseMirror img')).toHaveAttribute('src', `/api/features/attachments/${ATT_A}/download`));
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), { target: { value: '차트가 비어 있습니다' } });
    fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Analytics MS' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
    await waitFor(() => expect(props.onSubmitted).toHaveBeenCalledOnce());
    expect(posted?.body.attachment_ids).toEqual([ATT_A, ATT_B]);
    const doc = posted?.body.description_rich_content as { content: { type: string; attrs?: unknown }[] };
    expect(doc.content.filter(node => node.type === 'image')).toEqual([{ type: 'image', attrs: { id: ATT_A } }]);
    expect(doc.content.some(node => node.type === 'attachmentRef')).toBe(false);
  });
});
