import type { MeResponse } from '../../../../../lib/api/me';
import type { VocDetailEnvelope, VocListItem } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { detailFixtures } = vi.hoisted(() => ({
  detailFixtures: {} as Record<string, unknown>,
}));

vi.mock('../../../../../lib/cross-system/useVocDetail', () => ({
  useVocDetail: (id: string | null | undefined) => {
    const data = id ? detailFixtures[id] : undefined;
    return {
      data,
      isPending: id != null && data === undefined,
      isFetching: false,
      isError: false,
      isSuccess: data !== undefined,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('../TriagePanel', () => ({
  TriagePanel: ({
    voc,
    onConfirmSuccess,
  }: {
    voc: VocListItem;
    onConfirmSuccess?: (voc: VocListItem, dismissUndo: () => void) => void;
  }) => (
    <button
      type="button"
      data-testid={`complete-confirm-${voc.id}`}
      onClick={() => onConfirmSuccess?.(voc, vi.fn())}
    >
      Complete confirm {voc.display_id}
    </button>
  ),
}));

vi.mock('../../detail/PublicUpdateComposer', async () => {
  const React = await import('react');
  return {
    PublicUpdateComposer: ({ voc }: { voc: VocDetailEnvelope }) => {
      const [draft, setDraft] = React.useState(`Draft for ${voc.display_id}`);
      return (
        <textarea
          data-testid={`public-update-${voc.id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      );
    },
  };
});

import { VocTriageScreen } from '../VocTriageScreen';

const VOC_A_ID = '10000000-0000-4000-8000-000000000001';
const VOC_B_ID = '10000000-0000-4000-8000-000000000002';
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

function makeVoc(id: string, displayId: string): VocListItem {
  return {
    id,
    display_id: displayId,
    title: `${displayId} title`,
    reporter_facing_status: 'received',
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

function makeDetail(item: VocListItem): VocDetailEnvelope {
  return {
    ...item,
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

function Harness({ items }: { items: VocListItem[] }): ReactElement {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? null);
  const client = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  )[0];

  return (
    <QueryClientProvider client={client}>
      <button type="button" data-testid="select-second-voc" onClick={() => setSelectedId(VOC_B_ID)}>
        Select second VOC
      </button>
      <VocTriageScreen
        items={items}
        selectedId={selectedId}
        activeTab="untriaged"
        me={ME}
        onSelectVoc={setSelectedId}
        onTabChange={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('VOC triage editor ownership', () => {
  it('keeps the first confirmed VOC open when another confirm finishes', async () => {
    const items = [makeVoc(VOC_A_ID, 'VOC-PU-A'), makeVoc(VOC_B_ID, 'VOC-PU-B')];
    for (const item of items) detailFixtures[item.id] = makeDetail(item);

    render(<Harness items={items} />);
    fireEvent.click(screen.getByTestId(`complete-confirm-${VOC_A_ID}`));
    const firstEditor = await screen.findByTestId(`public-update-${VOC_A_ID}`);
    fireEvent.change(firstEditor, { target: { value: 'Edited answer for A' } });

    fireEvent.click(screen.getByTestId('select-second-voc'));
    fireEvent.click(screen.getByTestId(`complete-confirm-${VOC_B_ID}`));

    expect(await screen.findByTestId(`public-update-${VOC_A_ID}`)).toHaveValue(
      'Edited answer for A',
    );
    expect(screen.queryByTestId(`public-update-${VOC_B_ID}`)).not.toBeInTheDocument();
  });
});

afterEach(() => {
  for (const id of Object.keys(detailFixtures)) delete detailFixtures[id];
  vi.unstubAllGlobals();
});
