// #1358 node b: the drawer's system picker honors `GET /vocs/create-targets`. fetch is mocked directly (house style); the editor is a textarea.

import { configureApiClient } from '@/lib/api/client';
import { VOC_CREATE_COPY } from '@/lib/copy/voc';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VocComposeScreen, type VocComposeScreenProps } from '../VocComposeScreen';

vi.mock('@ap/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ap/ui')>()),
  RichEditor: ({ onChange }: { onChange: (doc: unknown) => void }) => (
    <textarea
      data-testid="mock-rich-editor"
      aria-label="상세 설명"
      onChange={(e) =>
        onChange({
          type: 'doc',
          content: e.target.value
            ? [{ type: 'paragraph', content: [{ type: 'text', text: e.target.value }] }]
            : [],
        })
      }
    />
  ),
}));

const OPEN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLOSED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const VOC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ms = (id: string, slug: string, name: string) => ({
  id,
  workspace_id: 'ws-1',
  slug,
  name,
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  default_reviewer_actor_id: null,
  default_reviewer_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const TARGETS = {
  items: [
    { managed_system_id: OPEN_ID, allowed: true },
    { managed_system_id: CLOSED_ID, allowed: false, reason: 'restricted' },
  ],
};

let targetsCalls = 0;
let postCalls = 0;
function installFetch(opts: { targets?: () => Response; post?: () => Response } = {}) {
  targetsCalls = 0;
  postCalls = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname;
    if (path === '/api/features/managed-systems')
      return json({ items: [ms(OPEN_ID, 'open', 'Open MS'), ms(CLOSED_ID, 'closed', 'Closed MS')], total: 2 });
    if (path === '/api/features/analytics-areas') return json({ items: [], total: 0 });
    if (path === '/api/features/vocs/create-targets') {
      targetsCalls += 1;
      return opts.targets ? opts.targets() : json(TARGETS);
    }
    if (path === '/api/features/vocs' && init?.method === 'POST') {
      postCalls += 1;
      return opts.post ? opts.post() : json({ id: VOC_ID, display_id: 'VOC-7' }, 201);
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
}

function mount(over: Partial<VocComposeScreenProps> = {}) {
  const seam = { canLink: () => false, Link: () => null, notifyError: vi.fn(), notifySuccess: vi.fn() } satisfies HostSeam;
  const props: VocComposeScreenProps = {
    contextBlock: { items: [], href: null },
    initialManagedSystemId: null,
    onSubmitted: vi.fn(),
    onCancel: vi.fn(),
    onDirtyChange: vi.fn(),
    ...over,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <VocComposeScreen {...props} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  return { seam, props };
}

function fillText() {
  fireEvent.change(screen.getByRole('textbox', { name: /제목/ }), { target: { value: '차트가 비어 있습니다' } });
  fireEvent.blur(screen.getByRole('textbox', { name: /제목/ }));
  fireEvent.change(screen.getByTestId('mock-rich-editor'), { target: { value: '재현 절차' } });
}

const submitButton = () => screen.getByRole('button', { name: 'VOC 제출' });

const originalFetch = globalThis.fetch;
beforeEach(() => configureApiClient({ basePath: '/api/features' }));
afterEach(() => {
  globalThis.fetch = originalFetch;
  configureApiClient({ basePath: '' });
});

describe('<VocComposeScreen> create-targets (#1358)', () => {
  it('lists a denied system disabled, with the visible reason', async () => {
    installFetch();
    mount();
    const closed = await screen.findByRole('radio', { name: 'Closed MS' });
    await waitFor(() => expect(closed).toBeDisabled());
    expect(screen.getByRole('radio', { name: 'Open MS' })).not.toBeDisabled();
    expect(screen.getByTestId('voc-create-denied-reason')).toHaveTextContent(VOC_CREATE_COPY.createDenied);
  });

  it('keeps a denied default selected, shows the reason, disables submit, and lets the user pick an allowed system', async () => {
    installFetch();
    mount({ initialManagedSystemId: CLOSED_ID });
    fillText();
    await waitFor(() => expect(screen.getByTestId('voc-create-denied-reason')).toBeInTheDocument());
    expect(screen.getByRole('radio', { name: 'Closed MS' })).toHaveAttribute('aria-checked', 'true');
    expect(submitButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Open MS' }));
    await waitFor(() => expect(submitButton()).not.toBeDisabled());
  });

  it('does not block when the targets query fails, and shows no reason', async () => {
    installFetch({ targets: () => json({ code: 'internal.unexpected', message: 'x' }, 500) });
    mount({ initialManagedSystemId: CLOSED_ID });
    fillText();
    await waitFor(() => expect(targetsCalls).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Closed MS' })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('radio', { name: 'Closed MS' })).not.toBeDisabled();
    expect(screen.queryByTestId('voc-create-denied-reason')).toBeNull();
    await waitFor(() => expect(submitButton()).not.toBeDisabled());
  });

  it('shows a 403 permission.denied from POST inline (no toast) and refetches the targets', async () => {
    installFetch({
      targets: () => json({ items: [{ managed_system_id: OPEN_ID, allowed: true }, { managed_system_id: CLOSED_ID, allowed: true }] }),
      post: () => json({ code: 'permission.denied', message: 'denied' }, 403),
    });
    const { seam } = mount();
    fillText();
    fireEvent.click(await screen.findByRole('radio', { name: 'Closed MS' }));
    await waitFor(() => expect(submitButton()).not.toBeDisabled());
    const before = targetsCalls;
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByTestId('voc-create-denied-reason')).toHaveTextContent(VOC_CREATE_COPY.createDenied));
    expect(postCalls).toBe(1);
    expect(seam.notifyError).not.toHaveBeenCalled();
    await waitFor(() => expect(targetsCalls).toBeGreaterThan(before));
  });
});
