// TriagePanel copy-link: the address is the host's (UX-1) and the result is reported through the host (UX-2).
import { registerNoticeHost } from '@/test/notice-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('@/lib/cross-system/useVocDetail', () => ({ useVocDetail: vi.fn() }));

beforeAll(registerNoticeHost);

import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { type HostSeam, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import type { VocDetailEnvelope, VocListItem } from '@ap/feature-shared';
import { toast } from 'sonner';
import { TriagePanel } from '../TriagePanel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const VOC: VocListItem = {
  id: '6d1762e4-0000-4000-8000-000000000001',
  display_id: 'VOC-CL1',
  title: '복사 테스트',
  reporter_facing_status: 'received',
  severity: null,
  owner_user_id: null,
  owner_team_id: null,
  analytics_area_id: null,
  primary_managed_system_id: '00000000-0000-0000-0000-000000000099',
  reporter_id: '00000000-0000-0000-0000-000000000010',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

function Panel({ host }: { host?: Partial<HostSeam> }) {
  const base = useHostSeam();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const seam = host === undefined ? base : { ...base, ...host };
  return (
    <QueryClientProvider client={qc}>
      <HostSeamProvider value={seam}>
        <TriagePanel voc={VOC} />
      </HostSeamProvider>
    </QueryClientProvider>
  );
}

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'isSecureContext', {
    value: true,
    configurable: true,
    writable: true,
  });
}

describe('TriagePanel copy link', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.mocked(useVocDetail).mockReturnValue({
      data: {
        ...VOC,
        description_rich_content: null,
        next_actions: [],
        next_reporter_states: { allowed: [], forbidden: {} },
        linked_execution: { findingRef: null, taskRef: null },
        conversation_timeline: [],
        conversation_page: { has_more: false },
        permission_decisions: {},
        attachments: [],
      } as unknown as VocDetailEnvelope,
      isLoading: false,
      isError: false,
    } as never);
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ actors: [] })),
    ) as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    // biome-ignore lint/performance/noDelete: removing the shadow restores the real descriptor
    delete (navigator as { clipboard?: unknown }).clipboard;
    // biome-ignore lint/performance/noDelete: same, for the secure-context shim
    delete (window as { isSecureContext?: unknown }).isSecureContext;
    vi.clearAllMocks();
  });

  it('standalone: copies the same address as before (origin + the inbox path of the VOC) and toasts through sonner', async () => {
    stubClipboard(async () => {});
    render(<Panel />);
    fireEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('링크가 복사되었습니다.'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/vocs?view=inbox&selected=${VOC.id}`,
    );
  });

  it("platform host: copies the host's address of the VOC, not the FeedbackOps path, and reports success through the host", async () => {
    stubClipboard(async () => {});
    const notifySuccess = vi.fn();
    const absoluteHref = vi.fn(
      (to: string) =>
        `https://platform.example/feedbackops/vocs?focus=${new URL(to, 'http://x').searchParams.get('selected')}`,
    );
    render(<Panel host={{ absoluteHref, notifySuccess }} />);
    fireEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('링크가 복사되었습니다.'));
    expect(absoluteHref).toHaveBeenCalledWith(`/vocs?view=inbox&selected=${VOC.id}`);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `https://platform.example/feedbackops/vocs?focus=${VOC.id}`,
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('platform host: a copy that fails is reported as a failure through the host', async () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    const notifyError = vi.fn();
    render(<Panel host={{ absoluteHref: () => 'https://platform.example/x', notifyError }} />);
    fireEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        '링크를 복사하지 못했습니다. 주소창의 URL을 직접 복사해 주세요.',
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a host with no address for the VOC shows no copy action', () => {
    render(<Panel host={{ absoluteHref: () => null }} />);
    expect(screen.queryByRole('button', { name: '링크 복사' })).toBeNull();
  });
});
