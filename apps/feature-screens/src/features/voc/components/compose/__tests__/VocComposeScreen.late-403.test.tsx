// #1358 fix round (F5): a late 403 belongs to the system that was submitted, not to the current selection.

import { configureApiClient } from '@/lib/api/client';
import { VOC_CREATE_COPY } from '@/lib/copy/voc';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VOC_CREATE_TARGETS_QUERY_KEY } from '@/lib/api/voc-create-targets';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

let targetsAllowed: string[];
let releasePost: (response: Response) => void;
function installFetch() {
  targetsAllowed = [OPEN_ID];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname;
    if (path === '/api/features/managed-systems')
      return json({ items: [ms(OPEN_ID, 'open', 'Open MS'), ms(CLOSED_ID, 'closed', 'Closed MS')], total: 2 });
    if (path === '/api/features/analytics-areas') return json({ items: [], total: 0 });
    if (path === '/api/features/vocs/create-targets')
      return json({ items: [OPEN_ID, CLOSED_ID].map((id) => (targetsAllowed.includes(id) ? { managed_system_id: id, allowed: true } : { managed_system_id: id, allowed: false, reason: 'restricted' })) });
    if (path === '/api/features/vocs' && init?.method === 'POST') return new Promise<Response>((resolve) => { releasePost = resolve; });
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
  return { seam, props, client };
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

const denied = () => new Response(JSON.stringify({ code: 'permission.denied', message: 'denied' }), { status: 403, headers: { 'content-type': 'application/json' } });
async function submitFrom(systemName: string) {
  installFetch();
  targetsAllowed = [OPEN_ID, CLOSED_ID];
  const mounted = mount();
  fillText();
  fireEvent.click(await screen.findByRole('radio', { name: systemName }));
  await waitFor(() => expect(submitButton()).not.toBeDisabled());
  fireEvent.click(submitButton());
  await waitFor(() => expect(typeof releasePost).toBe('function'));
  return mounted.client;
}

describe('<VocComposeScreen> late 403 (#1358 F5)', () => {
  it('does not attach a 403 for the submitted system to a different selection', async () => {
    await submitFrom('Closed MS');
    fireEvent.click(screen.getByRole('radio', { name: 'Open MS' }));
    releasePost(denied());
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).includes('create-targets')).length).toBeGreaterThan(1));
    expect(screen.queryByTestId('voc-create-denied-reason')).toBeNull();
    // Going back does not resurrect it either: the selection change ended that failure.
    fireEvent.click(screen.getByRole('radio', { name: 'Closed MS' }));
    expect(screen.queryByTestId('voc-create-denied-reason')).toBeNull();
  });

  it('shows the 403 on the submitted system while it stays selected', async () => {
    await submitFrom('Closed MS');
    releasePost(denied());
    await waitFor(() => expect(screen.getByTestId('voc-create-denied-reason')).toHaveTextContent(VOC_CREATE_COPY.createDenied));
  });

  it('clears the failure once a newer targets answer says the system is allowed', async () => {
    const client = await submitFrom('Closed MS');
    releasePost(denied());
    await waitFor(() => expect(screen.getByTestId('voc-create-denied-reason')).toBeInTheDocument());
    // A later judgement finds the system allowed.
    targetsAllowed = [OPEN_ID, CLOSED_ID];
    await act(async () => { await client.refetchQueries({ queryKey: VOC_CREATE_TARGETS_QUERY_KEY }); });
    await waitFor(() => expect(screen.queryByTestId('voc-create-denied-reason')).toBeNull());
  });
});
