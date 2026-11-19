import {
  noticeHost,
  noticeMessages,
  registerNoticeHost,
  undoNoticeRenderer,
} from '../../../../../test/notice-host';
import type { MeResponse } from '../../../../../lib/api/me';
import type { TipTapDoc, TipTapEditor } from '@ap/ui';
import type { VocDetailEnvelope, VocListItem } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { editorFocus } = vi.hoisted(() => ({ editorFocus: vi.fn() }));

vi.mock('../../../../../lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/api/registry-reads')>()),
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('../../../../../lib/api/voc-owner-candidates', () => ({
  fetchVocOwnerCandidates: vi.fn(async () => ({ actors: [] })),
}));
vi.mock('../ClusterSectionReadOnly', () => ({ ClusterSectionReadOnly: () => null }));
vi.mock('@ap/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/ui')>();
  return {
    ...actual,
    RichEditor: ({
      value,
      onChange,
      toolbar,
      ariaLabel,
    }: {
      value?: TipTapDoc | null;
      onChange?: (doc: TipTapDoc) => void;
      toolbar?: (editor: TipTapEditor | null) => ReactNode;
      ariaLabel?: string;
    }) => {
      const editor = {
        commands: { focus: editorFocus },
        isActive: () => false,
      } as unknown as TipTapEditor;
      const text =
        value?.content
          ?.flatMap((node) => node.content ?? [])
          .map((node) => ('text' in node ? node.text : ''))
          .join('') ?? '';
      return (
        <>
          {toolbar?.(editor)}
          <textarea
            data-testid="editor-public-update"
            aria-label={ariaLabel}
            value={text}
            onChange={(event) =>
              onChange?.({
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: event.target.value.length
                      ? [{ type: 'text', text: event.target.value }]
                      : [],
                  },
                ],
              })
            }
          />
        </>
      );
    },
  };
});

noticeHost.notify.mockImplementation((notice) => {
  if (notice.variant === 'undo') undoRenderer = undoNoticeRenderer(notice);
  return 'triage-public-update-toast';
});
beforeAll(registerNoticeHost);

import { VOC_TRIAGE_PUBLIC_UPDATE_COPY } from '../../../../../lib/copy/voc';
import { VocTriageScreen } from '../VocTriageScreen';

const VOC_ID = '10000000-0000-4000-8000-000000000001';
const MS_ID = '10000000-0000-4000-8000-000000000099';
const ME: MeResponse = {
  actor: {
    id: '10000000-0000-4000-8000-000000000010',
    external_id: 'triage-operator',
    email: 'operator@example.test',
    display_name: '운영자',
    role_level: 'developer',
  },
  workspace_id: '10000000-0000-4000-8000-000000000098',
};

function makeVoc(status: VocListItem['reporter_facing_status'] = 'received'): VocListItem {
  return {
    id: VOC_ID,
    display_id: 'VOC-PU-1',
    title: '분류 후 공개 업데이트',
    reporter_facing_status: status,
    severity: null,
    owner_user_id: null,
    owner_team_id: null,
    analytics_area_id: null,
    primary_managed_system_id: MS_ID,
    reporter_id: '10000000-0000-4000-8000-000000000020',
    triage_state: 'untriaged',
    source_context: 'direct_use',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  };
}

function makeDetail(status: VocDetailEnvelope['reporter_facing_status'] = 'received'): VocDetailEnvelope {
  const item = makeVoc(status);
  return {
    ...item,
    owner_user_id: item.owner_user_id ?? null,
    owner_team_id: item.owner_team_id ?? null,
    severity: item.severity ?? null,
    updated_at: '2026-05-02T00:00:00.000Z',
    description_rich_content: { type: 'doc', content: [] },
    next_actions: [],
    next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
    linked_execution: { findingRef: null, taskRef: null },
    conversation_timeline: [],
    conversation_page: { has_more: false },
    permission_decisions: {},
    attachments: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let undoRenderer: ((id: string | number) => ReactNode) | null = null;

function setup({
  status = 'received',
  canWritePublicUpdate = true,
}: {
  status?: VocListItem['reporter_facing_status'];
  canWritePublicUpdate?: boolean;
} = {}) {
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const detail = makeDetail(status);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: Record<string, unknown> = {};
      if (init?.body) body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ url, method, body });

      if (method === 'PATCH') {
        const triageState = body.triage_state === 'untriaged' ? 'untriaged' : 'triaged';
        return jsonResponse({ id: VOC_ID, triage_state: triageState, updated_at: '2026-05-03T00:00:00.000Z' });
      }
      if (method === 'POST') {
        return jsonResponse({
          public_update: {
            id: '10000000-0000-4000-8000-000000000040',
            voc_id: VOC_ID,
            body_rich_content: body.body_rich_content,
            reporter_facing_status_before: 'received',
            reporter_facing_status_after: body.next_reporter_facing_status,
            skip_public_update: false,
            skip_reason: null,
            created_at: '2026-05-03T00:00:00.000Z',
          },
          voc: { ...detail, reporter_facing_status: body.next_reporter_facing_status },
        });
      }
      return jsonResponse(detail);
    }),
  );

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <VocTriageScreen
        items={[makeVoc(status)]}
        selectedId={VOC_ID}
        activeTab="untriaged"
        canWritePublicUpdate={canWritePublicUpdate}
        me={ME}
        onSelectVoc={vi.fn()}
        onTabChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { ...rendered, requests, client };
}

function confirmTriage(): void {
  fireEvent.click(screen.getByRole('button', { name: /분류 확정/ }));
}

async function waitForPublicUpdateDialog(): Promise<void> {
  await screen.findByRole('dialog');
  await screen.findByTestId('editor-public-update');
}

function publishRequest(requests: Array<{ url: string; method: string; body: Record<string, unknown> }>) {
  return requests.find((request) => request.method === 'POST');
}

beforeEach(() => {
  undoRenderer = null;
  editorFocus.mockClear();
  noticeHost.notify.mockClear();
  noticeHost.dismiss.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VOC triage confirm and Public Update', () => {
  it('opens the existing composer after a received VOC is confirmed and publishes status with the prefill', async () => {
    const { requests } = setup();

    confirmTriage();
    await waitForPublicUpdateDialog();

    const editor = screen.getByTestId('editor-public-update');
    expect(editor).toHaveValue(VOC_TRIAGE_PUBLIC_UPDATE_COPY.prefill);
    expect(screen.getByRole('combobox', { name: '다음 공개 상태 선택' })).toHaveTextContent('검토 중');
    expect(editorFocus).toHaveBeenCalledWith('end');

    fireEvent.change(editor, { target: { value: '추가 확인 중입니다.' } });
    expect(editor).toHaveValue('추가 확인 중입니다.');
    fireEvent.click(screen.getByRole('button', { name: '답변 공개' }));

    await waitFor(() => expect(publishRequest(requests)).toBeDefined());
    expect(publishRequest(requests)?.url).toContain(`/vocs/${VOC_ID}/public-updates`);
    expect(publishRequest(requests)?.body).toEqual(
      expect.objectContaining({
        skip_public_update: false,
        next_reporter_facing_status: 'reviewing',
        body_rich_content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '추가 확인 중입니다.' }],
            },
          ],
        },
      }),
    );
  });

  it.each([
    { status: 'reviewing' as const, canWritePublicUpdate: true, reason: 'status already moved' },
    { status: 'received' as const, canWritePublicUpdate: false, reason: 'actor cannot write' },
  ])('does not open the editor when $reason', async ({ status, canWritePublicUpdate }) => {
    const { requests } = setup({ status, canWritePublicUpdate });

    confirmTriage();
    await waitFor(() => expect(requests.some((request) => request.method === 'PATCH')).toBe(true));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(publishRequest(requests)).toBeUndefined();
  });

  it('closes without a Public Update request when the editor is dismissed', async () => {
    const { requests } = setup();

    confirmTriage();
    await waitForPublicUpdateDialog();
    fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: '미분류' })).toHaveFocus();
    expect(publishRequest(requests)).toBeUndefined();
  });

  it('closes the editor when triage is undone and sends no Public Update request', async () => {
    const { requests } = setup();

    confirmTriage();
    await waitForPublicUpdateDialog();
    expect(undoRenderer).not.toBeNull();

    const toast = render(<ol data-sonner-toaster><li data-sonner-toast>{undoRenderer?.('triage-undo')}</li></ol>);
    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(publishRequest(requests)).toBeUndefined();
    expect(requests.some((request) => request.method === 'PATCH' && request.body.triage_state === 'untriaged')).toBe(true);
    expect(noticeMessages('error')).toHaveLength(0);
    toast.unmount();
  });
});
