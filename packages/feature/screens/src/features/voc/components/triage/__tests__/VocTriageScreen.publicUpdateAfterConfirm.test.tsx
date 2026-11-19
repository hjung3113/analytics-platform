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

function makeVoc(
  status: VocListItem['reporter_facing_status'] = 'received',
  id = VOC_ID,
  displayId = 'VOC-PU-1',
): VocListItem {
  return {
    id,
    display_id: displayId,
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

function makeDetail(
  status: VocDetailEnvelope['reporter_facing_status'] = 'received',
  id = VOC_ID,
  displayId = 'VOC-PU-1',
): VocDetailEnvelope {
  const item = makeVoc(status, id, displayId);
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
  detailStatus = status,
  actorRole = 'developer',
  items: suppliedItems,
}: {
  status?: VocListItem['reporter_facing_status'];
  detailStatus?: VocDetailEnvelope['reporter_facing_status'];
  actorRole?: MeResponse['actor']['role_level'];
  items?: VocListItem[];
} = {}) {
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const items = suppliedItems ?? [makeVoc(status)];
  let nextDetailFetchGate: {
    started: () => void;
    startedPromise: Promise<void>;
    wait: Promise<void>;
  } | null = null;
  const holdNextDetailFetch = () => {
    let start!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      start = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    nextDetailFetchGate = { started: start, startedPromise, wait };
    return { started: startedPromise, release };
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: Record<string, unknown> = {};
      if (init?.body) body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push({ url, method, body });
      const vocId = url.match(/\/vocs\/([^/?]+)/)?.[1] ?? VOC_ID;
      const selectedItem = items.find((item) => item.id === vocId);
      const selectedDetailStatus =
        vocId === VOC_ID ? detailStatus : selectedItem?.reporter_facing_status ?? status;
      const detail = makeDetail(
        selectedDetailStatus,
        vocId,
        selectedItem?.display_id ?? 'VOC-PU-1',
      );

      if (method === 'PATCH') {
        const triageState = body.triage_state === 'untriaged' ? 'untriaged' : 'triaged';
        return jsonResponse({ id: vocId, triage_state: triageState, updated_at: '2026-05-03T00:00:00.000Z' });
      }
      if (method === 'POST') {
        return jsonResponse({
          public_update: {
            id: '10000000-0000-4000-8000-000000000040',
            voc_id: vocId,
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
      const fetchGate = method === 'GET' ? nextDetailFetchGate : null;
      if (fetchGate !== null) {
        nextDetailFetchGate = null;
        fetchGate.started();
        await fetchGate.wait;
      }
      return jsonResponse(detail);
    }),
  );

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onProcessed = vi.fn();
  const rendered = render(
    <QueryClientProvider client={client}>
      <VocTriageScreen
        items={items}
        selectedId={VOC_ID}
        activeTab="untriaged"
        me={{ ...ME, actor: { ...ME.actor, role_level: actorRole } }}
        onProcessed={onProcessed}
        onSelectVoc={vi.fn()}
        onTabChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { ...rendered, requests, client, onProcessed, holdNextDetailFetch };
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

async function waitForConfirmSuccess(onProcessed: ReturnType<typeof vi.fn>): Promise<void> {
  await waitFor(() =>
    expect(noticeHost.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'success', variant: 'undo' }),
    ),
  );
  await waitFor(() => expect(onProcessed).toHaveBeenCalledWith(1));
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

    expect(screen.getByText(VOC_TRIAGE_PUBLIC_UPDATE_COPY.description)).toBeInTheDocument();
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(noticeHost.dismiss).toHaveBeenCalledWith('triage-public-update-toast');
  });

  it.each([
    {
      status: 'reviewing' as const,
      detailStatus: 'received' as const,
      actorRole: 'developer' as const,
      reason: 'status already moved',
    },
    { status: 'received' as const, actorRole: 'user' as const, reason: 'actor cannot write' },
  ])('does not open the editor when $reason', async (options) => {
    const { requests, onProcessed } = setup(options);

    confirmTriage();
    await waitForConfirmSuccess(onProcessed);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(publishRequest(requests)).toBeUndefined();
  });

  it('keeps the edited composer mounted during a detail refetch', async () => {
    const { client, holdNextDetailFetch } = setup();

    confirmTriage();
    await waitForPublicUpdateDialog();
    fireEvent.change(screen.getByTestId('editor-public-update'), {
      target: { value: '작성 중인 답변' },
    });
    const refetch = holdNextDetailFetch();

    let invalidation!: Promise<void>;
    await act(async () => {
      invalidation = client.invalidateQueries({ queryKey: ['voc', VOC_ID], exact: true });
      await refetch.started;
    });

    await waitFor(() => expect(client.getQueryState(['voc', VOC_ID])?.fetchStatus).toBe('fetching'));
    expect(screen.queryByText(VOC_TRIAGE_PUBLIC_UPDATE_COPY.loading)).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-public-update')).toHaveValue('작성 중인 답변');
    refetch.release();
    await act(async () => invalidation);
  });

  it('closes the editor and dismisses triage undo after publishing without changing status', async () => {
    const { requests } = setup();

    confirmTriage();
    await waitForPublicUpdateDialog();
    fireEvent.click(screen.getByRole('combobox', { name: '다음 공개 상태 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '접수됨 (현재)' }));
    fireEvent.click(screen.getByRole('button', { name: '답변 공개' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(publishRequest(requests)?.body).toEqual(
      expect.objectContaining({ next_reporter_facing_status: 'received' }),
    );
    expect(noticeHost.dismiss).toHaveBeenCalledWith('triage-public-update-toast');
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

  it('asks before discarding an edited draft with Escape', async () => {
    const { requests } = setup();

    confirmTriage();
    await waitForPublicUpdateDialog();
    fireEvent.change(screen.getByTestId('editor-public-update'), {
      target: { value: '작성한 답변' },
    });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByTestId('triage-public-update-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이동' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
