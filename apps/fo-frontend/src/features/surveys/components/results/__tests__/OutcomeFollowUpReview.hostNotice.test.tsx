import {
  type HostLinkProps,
  type HostNotice,
  type HostSeam,
  HostSeamProvider,
} from '@/lib/host/host-seam';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import type { OutcomeFollowUpReadDto, SurveyResultDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { markFollowUp, reopenFollowUp } = vi.hoisted(() => ({
  markFollowUp: vi.fn(),
  reopenFollowUp: vi.fn(),
}));

vi.mock('@/features/surveys/hooks/useOutcomeFollowUp', () => ({
  invalidateOutcomeFollowUpAfterConflict: vi.fn(),
  useMarkOutcomeFollowUpNoAction: () => ({ mutateAsync: markFollowUp, isPending: false }),
  useReopenOutcomeFollowUp: () => ({ mutateAsync: reopenFollowUp, isPending: false }),
}));

vi.mock('../CreateFindingDraftPanel', () => ({
  CreateFindingDraftPanel: ({
    onCreated,
    scopedResponseId,
  }: {
    onCreated: (finding: { display_id: string }, responseId: string) => void;
    scopedResponseId: string;
  }) => (
    <button onClick={() => onCreated({ display_id: 'FND-424' }, scopedResponseId)} type="button">
      Complete test Finding
    </button>
  ),
  excerptsByResponse: () => [[{ id: 'excerpt-1', response_id: 'response-1' }]],
}));

vi.mock('@/features/admin/public', () => ({ RequestAccessButton: () => null }));
vi.mock('@tanstack/react-router', () => ({ Link: () => null }));

import { OutcomeFollowUpReview } from '../OutcomeFollowUpReview';

function DetailPanelHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}

const RESPONSE_ID = 'response-1';
const SURVEY = {
  id: 'survey-1',
  display_id: 'SRV-21',
  title: 'Survey follow-up',
  type: 'outcome',
  status: 'closed',
} as const;

const FOLLOW_UP_READ = {
  classifiable: true,
  personal_access: true,
  items: [
    {
      response_id: RESPONSE_ID,
      response_number: 4,
      submitted_at: '2026-09-21T00:00:00.000Z',
      low_answers: [],
      resolution: 'open',
      finding: null,
      decision: null,
      next_actions: [
        { id: 'create_finding', availability: 'allowed' },
        { id: 'mark_no_follow_up', availability: 'allowed' },
      ],
    },
  ],
} as unknown as OutcomeFollowUpReadDto;

const RESULTS = {} as SurveyResultDto;

function renderReview() {
  const notices: HostNotice[] = [];
  const notify = vi.fn((notice: HostNotice) => {
    notices.push(notice);
    return String(notices.length);
  });
  const seam: HostSeam = {
    canLink: () => true,
    Link: ({ to, children }: HostLinkProps) => <a href={to}>{children}</a>,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    notify,
    dismiss: vi.fn(),
    useHere: () => '/surveys/survey-1/follow-up',
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <HostSeamProvider value={seam}>
        <DetailPanelSlotProvider>
          <OutcomeFollowUpReview
            followUpRead={FOLLOW_UP_READ}
            results={RESULTS}
            survey={SURVEY as never}
          />
          <DetailPanelHost />
        </DetailPanelSlotProvider>
      </HostSeamProvider>
    </QueryClientProvider>,
  );

  return { notices, notify };
}

describe('OutcomeFollowUpReview host notices', () => {
  beforeEach(() => {
    markFollowUp.mockReset().mockResolvedValue(undefined);
    reopenFollowUp.mockReset().mockResolvedValue(undefined);
  });

  it('sends the follow-up decision success notice through the host seam', async () => {
    const { notices, notify } = renderReview();

    fireEvent.click(screen.getByRole('button', { name: '후속 조치 없음…' }));
    fireEvent.change(screen.getByTestId('follow-up-decision-reason'), {
      target: { value: '현재 범위에서는 후속 조치가 필요하지 않습니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '후속 조치 없음' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        tone: 'success',
        message: '후속 조치 없음으로 기록했습니다.',
      }),
    );
    expect(notices).toEqual([{ tone: 'success', message: '후속 조치 없음으로 기록했습니다.' }]);
  });

  it('sends the created Finding success notice through the host seam', async () => {
    const { notices, notify } = renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Finding 생성' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete test Finding' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        tone: 'success',
        message: 'Finding 생성 완료: FND-424',
      }),
    );
    expect(notices).toEqual([{ tone: 'success', message: 'Finding 생성 완료: FND-424' }]);
  });
});
