import type * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FindingDto,
  type VocDetailEnvelope,
  type VocListItem,
  vocDetailEnvelopeSchema,
  vocSummaryEnvelopeSchema,
} from '@ap/feature-shared';

import { type HostLinkProps, type HostSeam, HostSeamProvider } from '../../../../../lib/host/host-seam';
import { FullFindingDetail } from '../FullFindingDetail';

vi.mock('../../../hooks/useEvidenceHighlights', () => ({
  useEvidenceHighlights: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock('../../../../../lib/cross-system/usePermissionCheckBridge', () => ({
  usePermissionCheckBridge: () => ({ data: { state: 'approved' } }),
}));

vi.mock('../../../../../lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/api/me')>()),
  useMeBridge: () => ({ data: { actor: { role_level: 'admin' } } }),
}));

vi.mock('../../../../../lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));

vi.mock('../../../../../lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/api/registry-reads')>()),
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
  fetchManagedSystems: vi.fn(async () => ({
    items: [{ id: MS_ID, name: 'Billing Ops', archived_at: null }],
  })),
}));

vi.mock('../../../../../lib/cross-system/useVocDetail', () => ({
  useVocDetail: () => ({ data: null }),
}));

const useVocClusterDetailMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../voc-cluster/hooks/useVocClusterDetail', () => ({
  useVocClusterDetail: useVocClusterDetailMock,
}));

const WORKSPACE_ID = '90000000-0000-4000-8000-000000000009';
const MS_ID = '30000000-0000-4000-8000-000000000003';
const ACTOR_ID = '40000000-0000-4000-8000-000000000004';
const FINDING_ID = '10000000-0000-4000-8000-000000000001';
const CLUSTER_ID = '70000000-0000-4000-8000-000000000007';
const VOC_A_ID = '50000000-0000-4000-8000-00000000000a';
const VOC_B_ID = '50000000-0000-4000-8000-00000000000b';
const HIDDEN_VOC_ID = '50000000-0000-4000-8000-00000000000c';

const BASE_FINDING: FindingDto = {
  id: FINDING_ID,
  workspace_id: WORKSPACE_ID,
  display_id: 'FIN-2531',
  primary_managed_system_id: MS_ID,
  title: '결제 타임아웃 반복',
  summary: 'PG 응답 지연으로 결제가 실패합니다.',
  source_type: 'manual',
  source_id: null,
  owner_actor_id: null,
  owner_team_id: null,
  evidence_count: 0,
  severity: 'high',
  confidence: 'medium',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: ACTOR_ID,
  created_at: '2026-11-18T00:00:00.000Z',
  updated_at: '2026-11-18T00:00:00.000Z',
  source: null,
};

function makeVocDetail(id: string, displayId: string, title: string): VocDetailEnvelope {
  return vocDetailEnvelopeSchema.parse({
    id,
    display_id: displayId,
    title,
    primary_managed_system_id: MS_ID,
    analytics_area_id: null,
    reporter_id: ACTOR_ID,
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high',
    reporter_facing_status: 'reviewing',
    triage_state: 'triaged',
    source_context: 'direct_use',
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: '2026-11-18T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
    description_rich_content: { type: 'doc', content: [] },
    next_actions: [],
    next_reporter_states: { allowed: ['resolved'], forbidden: {} },
    linked_execution: { findingRef: null, taskRef: null },
    conversation_timeline: [],
    conversation_page: { has_more: false },
    permission_decisions: {},
    similar: { items: [] },
    attachments: [],
  });
}

function makeVocListItem(id: string, displayId: string, title: string): VocListItem {
  return {
    id,
    display_id: displayId,
    title,
    primary_managed_system_id: MS_ID,
    analytics_area_id: null,
    reporter_id: ACTOR_ID,
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high',
    reporter_facing_status: 'reviewing',
    triage_state: 'triaged',
    source_context: 'direct_use',
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: '2026-11-18T00:00:00.000Z',
    similar_count: 0,
    review_postponed_at: null,
    attachment_count: 0,
  };
}

function makeAllowedEvidenceLink(id: string, vocId: string, opts?: { status?: string; relation?: string }) {
  return {
    id,
    source_type: 'voc',
    source_id: vocId,
    target_type: 'finding',
    target_id: FINDING_ID,
    relation_type: opts?.relation ?? 'evidence_of',
    visibility: 'internal_only',
    status: opts?.status ?? 'active',
    managed_system_id: MS_ID,
    created_by: ACTOR_ID,
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: null,
    visibility_state: 'allowed',
  };
}

function makeRestrictedLink(id: string, visibilityState: 'hidden' | 'denied') {
  return {
    id,
    source_type: 'voc',
    target_type: 'finding',
    relation_type: 'evidence_of',
    status: 'active',
    managed_system_id: MS_ID,
    created_by: ACTOR_ID,
    created_at: '2026-11-18T00:00:00.000Z',
    updated_at: null,
    visibility_state: visibilityState,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderWithSeam(ui: React.ReactElement) {
  const notifySuccess = vi.fn();
  const notifyError = vi.fn();
  const seam: HostSeam = {
    canLink: () => true,
    Link: ({ to, children, ...rest }: HostLinkProps) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    notifyError,
    notifySuccess,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <HostSeamProvider value={seam}>{ui}</HostSeamProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient, notifySuccess, notifyError };
}

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  useVocClusterDetailMock.mockReset();
  useVocClusterDetailMock.mockReturnValue({ data: undefined, isSuccess: false });
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('FullFindingDetail linked evidence VOCs (#2531)', () => {
  it('links an existing VOC via 기존 근거 연결 and refreshes 연결된 VOC without reload', async () => {
    const user = userEvent.setup();
    const vocA = makeVocDetail(VOC_A_ID, 'VOC-101', '결제 승인 요청 타임아웃');
    const vocItemA = makeVocListItem(VOC_A_ID, 'VOC-101', '결제 승인 요청 타임아웃');
    let linkedItems: Array<ReturnType<typeof makeAllowedEvidenceLink>> = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/entity-links' && url.searchParams.get('target_type') === 'finding') {
        return jsonResponse({ items: linkedItems, page: { has_more: false } });
      }
      if (url.pathname === `/vocs/${VOC_A_ID}`) {
        return jsonResponse(vocA);
      }
      if (url.pathname === '/vocs') {
        return jsonResponse({ items: [vocItemA], page: { has_more: false } });
      }
      if (url.pathname === `/findings/${FINDING_ID}/link-evidence` && init?.method === 'POST') {
        const linkId = 'a1000000-0000-4000-8000-000000000001';
        linkedItems = [makeAllowedEvidenceLink(linkId, VOC_A_ID)];
        return jsonResponse({ id: linkId, relation_type: 'evidence_of' }, 201);
      }
      return jsonResponse({ items: [] });
    }) as typeof globalThis.fetch;

    const { notifySuccess, notifyError } = renderWithSeam(
      <FullFindingDetail finding={BASE_FINDING} />,
    );

    const linksSection = screen
      .getByTestId('finding-detail-panel')
      .querySelector('[data-anchor="links"]') as HTMLElement;
    await waitFor(() => expect(within(linksSection).getAllByText('—').length).toBeGreaterThan(0));

    await user.click(screen.getByTestId('link-evidence-btn'));
    await user.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    await user.click(await screen.findByRole('option', { name: 'VOC-101 · 결제 승인 요청 타임아웃' }));
    await user.click(screen.getByTestId('link-evidence-submit'));

    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('근거가 연결되었습니다.'));
    expect(notifyError).not.toHaveBeenCalled();

    const vocLink = await within(linksSection).findByRole('link', {
      name: /결제 승인 요청 타임아웃.*VOC-101/,
    });
    expect(vocLink).toHaveAttribute('href', `/vocs?view=inbox&selected=${VOC_A_ID}`);
    expect(screen.getByText('근거 하이라이트 (0)')).toBeInTheDocument();
  });

  it('keeps the error toast and does not list a VOC when link-evidence fails on the server', async () => {
    const user = userEvent.setup();
    const vocItemA = makeVocListItem(VOC_A_ID, 'VOC-101', '결제 승인 요청 타임아웃');

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/vocs') {
        return jsonResponse({ items: [vocItemA], page: { has_more: false } });
      }
      if (url.pathname === `/findings/${FINDING_ID}/link-evidence` && init?.method === 'POST') {
        return jsonResponse({ code: 'internal.unexpected', message: 'server error' }, 500);
      }
      return jsonResponse({ items: [] });
    }) as typeof globalThis.fetch;

    const { notifySuccess, notifyError } = renderWithSeam(
      <FullFindingDetail finding={BASE_FINDING} />,
    );

    await user.click(screen.getByTestId('link-evidence-btn'));
    await user.click(await screen.findByRole('combobox', { name: 'VOC 선택' }));
    await user.click(await screen.findByRole('option', { name: 'VOC-101 · 결제 승인 요청 타임아웃' }));
    await user.click(screen.getByTestId('link-evidence-submit'));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'),
    );
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /VOC-101/ })).not.toBeInTheDocument();
  });

  it('shows active evidence_of VOCs beside the source row on a cluster-sourced Finding and filters inactive or non-evidence links', async () => {
    useVocClusterDetailMock.mockReturnValue({
      isSuccess: true,
      data: { id: CLUSTER_ID, display_id: 'CLU-300', title: '결제 실패 묶음' },
    });
    const vocA = makeVocDetail(VOC_A_ID, 'VOC-101', '첫 번째 멤버 VOC');
    const vocB = makeVocDetail(VOC_B_ID, 'VOC-102', '두 번째 멤버 VOC');

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/entity-links' && url.searchParams.get('target_type') === 'finding') {
        return jsonResponse({
          items: [
            makeAllowedEvidenceLink('a1000000-0000-4000-8000-000000000001', VOC_A_ID),
            makeAllowedEvidenceLink('a1000000-0000-4000-8000-000000000002', VOC_B_ID),
            makeAllowedEvidenceLink('a1000000-0000-4000-8000-000000000003', HIDDEN_VOC_ID, {
              status: 'detached',
            }),
            makeAllowedEvidenceLink('a1000000-0000-4000-8000-000000000004', HIDDEN_VOC_ID, {
              relation: 'created_finding',
            }),
          ],
          page: { has_more: false },
        });
      }
      if (url.pathname === `/vocs/${VOC_A_ID}`) return jsonResponse(vocA);
      if (url.pathname === `/vocs/${VOC_B_ID}`) return jsonResponse(vocB);
      return jsonResponse({ items: [] });
    }) as typeof globalThis.fetch;

    renderWithSeam(
      <FullFindingDetail
        finding={{ ...BASE_FINDING, source_type: 'voc_cluster', source_id: CLUSTER_ID }}
      />,
    );

    const linksSection = screen
      .getByTestId('finding-detail-panel')
      .querySelector('[data-anchor="links"]') as HTMLElement;
    expect(within(linksSection).getByRole('link', { name: /결제 실패 묶음.*CLU-300/ })).toBeInTheDocument();
    expect(
      await within(linksSection).findByRole('link', { name: /첫 번째 멤버 VOC.*VOC-101/ }),
    ).toHaveAttribute('href', `/vocs?view=inbox&selected=${VOC_A_ID}`);
    expect(
      await within(linksSection).findByRole('link', { name: /두 번째 멤버 VOC.*VOC-102/ }),
    ).toHaveAttribute('href', `/vocs?view=inbox&selected=${VOC_B_ID}`);
    expect(within(linksSection).getAllByRole('link')).toHaveLength(3);
  });

  it.each([
    {
      name: 'hidden entity link',
      items: [makeRestrictedLink('a1000000-0000-4000-8000-000000000010', 'hidden')],
      vocStatus: 200,
    },
    {
      name: 'denied entity link',
      items: [makeRestrictedLink('a1000000-0000-4000-8000-000000000011', 'denied')],
      vocStatus: 200,
    },
    {
      name: 'allowed link whose VOC read is denied (403)',
      items: [makeAllowedEvidenceLink('a1000000-0000-4000-8000-000000000012', HIDDEN_VOC_ID)],
      vocStatus: 403,
    },
    {
      name: 'allowed link whose VOC read returns summary-only envelope',
      items: [makeAllowedEvidenceLink('a1000000-0000-4000-8000-000000000013', HIDDEN_VOC_ID)],
      vocStatus: 200,
      summaryOnly: true,
    },
  ])(
    'renders the safe placeholder and never exposes an ID for $name',
    async ({ items, vocStatus, summaryOnly }) => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === '/entity-links' && url.searchParams.get('target_type') === 'finding') {
          return jsonResponse({ items, page: { has_more: false } });
        }
        if (url.pathname === `/vocs/${HIDDEN_VOC_ID}`) {
          if (summaryOnly) {
            return jsonResponse(
              vocSummaryEnvelopeSchema.parse({
                id: HIDDEN_VOC_ID,
                display_id: 'VOC-SECRET',
                primary_managed_system_id: MS_ID,
                reporter_facing_status: 'received',
                created_at: '2026-11-18T00:00:00.000Z',
                permission_decisions: {},
              }),
            );
          }
          return jsonResponse({ code: 'permission.denied', message: 'denied' }, vocStatus);
        }
        return jsonResponse({ items: [] });
      }) as typeof globalThis.fetch;

      renderWithSeam(<FullFindingDetail finding={BASE_FINDING} />);

      const linksSection = screen
        .getByTestId('finding-detail-panel')
        .querySelector('[data-anchor="links"]') as HTMLElement;
      const placeholder = await within(linksSection).findByTestId('linked-evidence-voc-restricted');
      expect(placeholder).toHaveTextContent('접근할 수 없는 항목');
      expect(within(linksSection).queryByRole('link')).not.toBeInTheDocument();
      expect(linksSection.textContent).not.toContain(HIDDEN_VOC_ID.slice(0, 8));
      expect(linksSection.textContent).not.toContain('VOC-SECRET');
      expect(linksSection.textContent).not.toContain('a1000000');
    },
  );

  it('shows an error state when the entity-links target read fails', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/entity-links' && url.searchParams.get('target_type') === 'finding') {
        return jsonResponse({ code: 'internal.unexpected', message: 'down' }, 500);
      }
      return jsonResponse({ items: [] });
    }) as typeof globalThis.fetch;

    renderWithSeam(<FullFindingDetail finding={BASE_FINDING} />);

    const linksSection = screen
      .getByTestId('finding-detail-panel')
      .querySelector('[data-anchor="links"]') as HTMLElement;
    expect(
      await within(linksSection).findByText('근거 VOC 목록을 불러오지 못했습니다.'),
    ).toBeInTheDocument();
  });
});
