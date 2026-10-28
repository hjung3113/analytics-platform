// ReporterReplyComposer — an attachment added through the editor toolbar (#745 FIX2).

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { EDITOR_ATT_ID } = vi.hoisted(() => ({
  EDITOR_ATT_ID: 'eeee0000-0000-4000-8000-000000000001',
}));

vi.mock('@ap/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/ui')>();
  return {
    ...actual,
    RichEditor: ({
      onChange,
      surface,
    }: {
      onChange?: (doc: import('@ap/ui').TipTapDoc) => void;
      surface?: string;
    }) =>
      React.createElement('button', {
        type: 'button',
        'data-testid': `rich-editor-${surface ?? 'default'}`,
        onClick: () =>
          onChange?.({
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'reply' }] },
              {
                type: 'attachmentRef',
                attrs: {
                  id: EDITOR_ATT_ID,
                  name: 'log.txt',
                  size_bytes: 12,
                  mime_type: 'text/plain',
                },
              },
            ],
          }),
      }),
  };
});

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/features/voc/hooks/useVocReporterReplyMutation', () => ({
  useVocReporterReplyMutation: vi.fn(),
}));

import { useVocReporterReplyMutation } from '@/features/voc/hooks/useVocReporterReplyMutation';
import * as attachmentsApi from '@/lib/api/attachments';
import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@ap/feature-shared';
import { ReporterReplyComposer } from '../ReporterReplyComposer';

const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-3333',
  display_id: 'VOC-0003',
  title: '리포트',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: '00000000-0000-0000-0000-000000000001',
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'low',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  similar_count: 0,
  description_rich_content: { type: 'doc', content: [] },
  next_actions: [],
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
} as unknown as VocDetailEnvelope;

const ME_ADMIN: MeResponse = {
  actor: {
    id: ADMIN_ID,
    external_id: 'admin-1',
    email: 'admin@feedbackops.local',
    display_name: '관리자',
    role_level: 'admin',
  },
  workspace_id: 'ws-1111',
};

const ATTACHMENT = {
  id: 'cccc3333-0000-4000-8000-000000000003',
  name: 'photo.jpg',
  size_bytes: 4096,
  mime_type: 'image/jpeg',
  uploaded_by_actor_id: '00000000-0000-4000-8000-000000000099',
  created_at: '2026-05-22T10:00:00.000Z',
};

const DEFAULT_MUTATION = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  isIdle: true,
  isSuccess: false,
  isPaused: false,
  status: 'idle' as const,
  submittedAt: 0,
  variables: undefined,
  data: undefined,
  error: null,
  reset: vi.fn(),
  context: undefined,
  failureCount: 0,
  failureReason: null,
  mutateAsync: vi.fn(),
};

function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 4096): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

function pickFile(file: File): void {
  const input = document.querySelector(
    '[data-testid="reporter-reply-attachment-dropzone-input"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error('reporter-reply-attachment-dropzone-input not found');
  fireEvent.change(input, { target: { files: [file] } });
}

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('<ReporterReplyComposer> editor attachments (#745 FIX2)', () => {
  beforeEach(() => {
    vi.mocked(useVocReporterReplyMutation).mockReturnValue(
      DEFAULT_MUTATION as unknown as ReturnType<typeof useVocReporterReplyMutation>,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the editor attachment through attachment_ids ahead of the dropzone file', async () => {
    vi.spyOn(attachmentsApi, 'uploadAttachment').mockResolvedValue(ATTACHMENT);
    const mutateMock = vi.fn();
    vi.mocked(useVocReporterReplyMutation).mockReturnValue({
      ...DEFAULT_MUTATION,
      mutate: mutateMock,
    } as unknown as ReturnType<typeof useVocReporterReplyMutation>);

    render(<ReporterReplyComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-editor-reporter-reply'));
    await act(async () => {
      pickFile(makeFile());
    });
    await waitFor(() => {
      expect(screen.getByTestId('attachment-row').getAttribute('data-state')).toBe('uploaded');
    });
    await user.click(screen.getByRole('button', { name: '답변 보내기' }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const firstCall = mutateMock.mock.calls[0];
    if (!firstCall) throw new Error('expected the mutation to have been called');
    const calledVars = firstCall[0] as {
      body: { body_rich_content: unknown; attachment_ids: string[] };
    };
    expect(calledVars.body.attachment_ids).toEqual([EDITOR_ATT_ID, ATTACHMENT.id]);
    expect(calledVars.body.body_rich_content).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'reply' }] },
        { type: 'attachmentRef', attrs: { id: EDITOR_ATT_ID } },
      ],
    });
  });
});
