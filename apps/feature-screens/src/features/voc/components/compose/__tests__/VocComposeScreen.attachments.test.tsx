// C1, C3 — the platform drawer's VOC form with the editor toolbar's attachments and 401 on the writes.
// The editor is a stand-in that emits what the real `RichEditor` emits after an upload (an `attachmentRef` with
// `{ id, name, size_bytes, mime_type }`) and keeps the toolbar's `onAttachError` so a failed upload can be replayed.

import { configureApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { SHARED_ALLOWLISTS } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VocComposeScreen } from '../VocComposeScreen';
import { mergeAttachmentIds, normalizeAttachmentRefs } from '../attachment-refs';

const ATT_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ATT_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// 6 distinct editor ids + 5 dropzone ids = 11 merged ids, one over `MAX_ATTACHMENT_IDS_PER_PARENT`.
const EDITOR_SIX = Array.from(
  { length: 6 },
  (_, i) => `f1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const DROP_IDS = Array.from(
  { length: 5 },
  (_, i) => `f2000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);

const toolbarOpts = vi.hoisted(() => ({
  current: undefined as { onAttachError?: (e: unknown) => void } | undefined,
}));
vi.mock('../../create/VocDescriptionToolbar', () => ({
  vocDescriptionToolbar: (opts?: { onAttachError?: (e: unknown) => void }) => {
    toolbarOpts.current = opts;
    return null;
  },
}));

const uploaded = (id: string) => ({
  type: 'attachmentRef',
  attrs: { id, name: 'log.txt', size_bytes: 12, mime_type: 'text/plain' },
});
const docWithUpload = (...ids: string[]) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '재현 절차' }] },
    ...ids.map(uploaded),
  ],
});

vi.mock('@ap/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ap/ui')>()),
  RichEditor: ({ onChange }: { onChange: (doc: unknown) => void }) => (
    <>
      <button type="button" onClick={() => onChange(docWithUpload(ATT_A, ATT_B, ATT_A))}>
        에디터 첨부 올리기
      </button>
      <button type="button" onClick={() => onChange(docWithUpload(...EDITOR_SIX))}>
        에디터 첨부 6개 올리기
      </button>
    </>
  ),
}));

// The dropzone's upload pipeline has its own suite (`AttachmentDropzone.test.tsx`); the cap behavior
// under test here only needs its `onChange(uploaded ids)` contract.
vi.mock('../../create/AttachmentDropzone', () => ({
  AttachmentDropzone: ({ onChange }: { onChange: (ids: string[]) => void }) => (
    <div>
      <button type="button" onClick={() => onChange(DROP_IDS)}>
        드롭존 첨부 5개 추가
      </button>
      <button type="button" onClick={() => onChange(DROP_IDS.slice(0, 4))}>
        드롭존 첨부 4개 추가
      </button>
    </div>
  ),
}));

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

let posted: { body: Record<string, unknown> } | undefined;
function installFetch(post: Response) {
  posted = undefined;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname;
    if (path === '/api/fo/managed-systems') return json({ items: [MS_ITEM], total: 1 });
    if (path === '/api/fo/analytics-areas') return json({ items: [], total: 0 });
    if (path === '/api/fo/vocs' && init?.method === 'POST') {
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
async function fillAndSubmit() {
  fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
    target: { value: '차트가 비어 있습니다' },
  });
  fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
  fireEvent.click(screen.getByRole('button', { name: '에디터 첨부 올리기' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Analytics MS' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));
}

// What the server's `voc-description` allowlist rejects: any attribute outside the node's allowed set.
type RichNode = { type: string; attrs?: Record<string, unknown>; content?: RichNode[] };
function disallowedAttrs(node: RichNode): string[] {
  const allowed = Object.keys(SHARED_ALLOWLISTS['voc-description'].nodeAttrs[node.type] ?? {});
  const own = Object.keys(node.attrs ?? {})
    .filter((key) => !allowed.includes(key))
    .map((key) => `${node.type}.${key}`);
  return [...own, ...(node.content ?? []).flatMap(disallowedAttrs)];
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  toolbarOpts.current = undefined;
  configureApiClient({ basePath: '/api/fo', onUnauthorized });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  configureApiClient({ basePath: '' });
  onUnauthorized.mockReset();
});

describe('<VocComposeScreen> editor attachments (C3)', () => {
  it('sends attachmentRef nodes with id only and lists the editor-uploaded ids once in attachment_ids', async () => {
    installFetch(json({ id: 'v', display_id: 'VOC-7' }, 201));
    const { props } = mount();
    await fillAndSubmit();
    await waitFor(() => expect(props.onSubmitted).toHaveBeenCalledTimes(1));

    const body = posted?.body as { description_rich_content: RichNode; attachment_ids: string[] };
    expect(disallowedAttrs(body.description_rich_content)).toEqual([]);
    expect(
      body.description_rich_content.content?.filter((n) => n.type === 'attachmentRef'),
    ).toEqual([
      { type: 'attachmentRef', attrs: { id: ATT_A } },
      { type: 'attachmentRef', attrs: { id: ATT_B } },
      { type: 'attachmentRef', attrs: { id: ATT_A } },
    ]);
    expect(body.attachment_ids).toEqual([ATT_A, ATT_B]);
  });

  it('normalizeAttachmentRefs leaves other nodes untouched and mergeAttachmentIds dedupes without capping', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] },
      ],
    };
    expect(normalizeAttachmentRefs(doc as never)).toEqual({ doc, ids: [] });
    const many = Array.from(
      { length: 12 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(mergeAttachmentIds([many[0] as string], many)).toEqual(many);
  });
});

describe('<VocComposeScreen> attachment cap at submit (C3)', () => {
  it('11 merged ids block the submit with the limit error: no POST, no onSubmitted, draft kept', async () => {
    installFetch(json({ id: 'v', display_id: 'VOC-7' }, 201));
    const { props } = mount();
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '차트가 비어 있습니다' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
    fireEvent.click(screen.getByRole('button', { name: '에디터 첨부 6개 올리기' }));
    fireEvent.click(screen.getByRole('button', { name: '드롭존 첨부 5개 추가' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Analytics MS' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    expect(await screen.findByText('첨부는 최대 10개까지 연결할 수 있습니다.')).toBeInTheDocument();
    expect(posted).toBeUndefined();
    expect(props.onSubmitted).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /제목/ })).toHaveValue('차트가 비어 있습니다');
  });

  it('exactly 10 merged ids submit with all 10 ids', async () => {
    installFetch(json({ id: 'v', display_id: 'VOC-7' }, 201));
    const { props } = mount();
    fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), {
      target: { value: '차트가 비어 있습니다' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
    fireEvent.click(screen.getByRole('button', { name: '에디터 첨부 6개 올리기' }));
    fireEvent.click(screen.getByRole('button', { name: '드롭존 첨부 4개 추가' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Analytics MS' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'VOC 제출' }));

    await waitFor(() => expect(props.onSubmitted).toHaveBeenCalledTimes(1));
    expect(posted?.body.attachment_ids).toEqual([...EDITOR_SIX, ...DROP_IDS.slice(0, 4)]);
  });
});

describe('<VocComposeScreen> 401 on the writes (C1)', () => {
  it('a submit 401 is left to the session-lost path: no notifyError, no onSubmitted', async () => {
    installFetch(json({ code: 'auth.unauthenticated', message: 'x' }, 401));
    const { seam, props } = mount();
    await fillAndSubmit();
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'VOC 제출' })).not.toBeDisabled(),
    );
    expect(seam.notifyError).not.toHaveBeenCalled();
    expect(props.onSubmitted).not.toHaveBeenCalled();
  });

  it.each([
    [401, 0],
    [413, 1],
  ])('an editor upload failing with %s calls notifyError %s time(s)', (status, count) => {
    installFetch(json({}));
    const { seam } = mount();
    toolbarOpts.current?.onAttachError?.(
      new ApiError(status, {
        code: status === 401 ? 'auth.unauthenticated' : 'attachment.too_large',
        message: 'x',
      } as never),
    );
    expect(vi.mocked(seam.notifyError)).toHaveBeenCalledTimes(count);
  });
});
