// PublicUpdateComposer — no editor attach on the public-update surface (#745): its allowlist has no attachmentRef,
// so the editor cannot hold the node; files go through the dropzone.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('@/features/voc/hooks/useVocPublicUpdateMutation', () => ({
  useVocPublicUpdateMutation: vi.fn(),
}));

import { useVocPublicUpdateMutation } from '@/features/voc/hooks/useVocPublicUpdateMutation';
import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { PublicUpdateComposer } from '../PublicUpdateComposer';

const REPORTER_ID = '00000000-0000-0000-0000-000000000001';
const ADMIN_ID = '00000000-0000-0000-0000-000000000002';

const BASE_VOC: VocDetailEnvelope = {
  id: 'voc-uuid-1111',
  display_id: 'VOC-0001',
  title: '테스트 VOC',
  primary_managed_system_id: 'ms-1',
  analytics_area_id: null,
  reporter_id: REPORTER_ID,
  owner_user_id: ADMIN_ID,
  owner_team_id: null,
  severity: 'high',
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

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('<PublicUpdateComposer> editor attach (#745)', () => {
  beforeEach(() => {
    vi.mocked(useVocPublicUpdateMutation).mockReturnValue(
      DEFAULT_MUTATION as unknown as ReturnType<typeof useVocPublicUpdateMutation>,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers no editor attach button; the dropzone stays', async () => {
    render(<PublicUpdateComposer voc={BASE_VOC} me={ME_ADMIN} />, { wrapper: wrap() });
    await waitFor(() => expect(screen.getByTestId('public-update-composer')).toBeInTheDocument());
    expect(screen.queryByTestId('public-update-attach')).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-testid="public-update-attachment-dropzone-input"]'),
    ).not.toBeNull();
  });
});
