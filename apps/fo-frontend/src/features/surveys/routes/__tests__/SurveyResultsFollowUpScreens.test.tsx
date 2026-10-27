// The results and follow-up screens under a bare `HostSeamProvider` (no router), as the platform bridge mounts them (#764 q).
import { ApiError } from '@/lib/api/types';
import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import {
  type HostLinkProps,
  type HostNotice,
  type HostSeam,
  HostSeamProvider,
} from '@/lib/host/host-seam';
import type { OutcomeFollowUpReadDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useSurvey,
  useSurveyResults,
  useOutcomeFollowUp,
  useSurveyReadGate,
  useSurveyResultsController,
  markFollowUp,
} = vi.hoisted(() => ({
  useSurvey: vi.fn(),
  useSurveyResults: vi.fn(),
  useOutcomeFollowUp: vi.fn(),
  useSurveyReadGate: vi.fn(),
  useSurveyResultsController: vi.fn(),
  markFollowUp: vi.fn(),
}));

vi.mock('@/features/surveys/hooks/useSurveys', () => ({ useSurvey, useSurveyResults }));
vi.mock('@/features/surveys/hooks/useOutcomeFollowUp', () => ({
  useOutcomeFollowUp,
  invalidateOutcomeFollowUpAfterConflict: vi.fn(),
  useMarkOutcomeFollowUpNoAction: () => ({ mutateAsync: markFollowUp, isPending: false }),
  useReopenOutcomeFollowUp: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/surveys/routes/SurveyPermissionGate', () => ({ useSurveyReadGate }));
vi.mock('@/features/surveys/hooks/useSurveyResultsController', () => ({
  useSurveyResultsController,
}));
vi.mock('@/features/admin/public', () => ({
  RequestAccessButton: ({ returnRouteIntent }: { returnRouteIntent: string }) => (
    <button data-return-route-intent={returnRouteIntent} type="button">
      권한 요청
    </button>
  ),
}));
vi.mock('@/features/findings/components/FindingDetail/FindingRequestTaskDraftHost', () => ({
  FindingRequestTaskDraftHost: () => null,
}));
vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: () => ({ data: undefined, isError: false, isFetching: false }),
}));
vi.mock('@/features/surveys/components/results/CreateFindingDraftPanel', () => ({
  CreateFindingDraftPanel: () => null,
  excerptsByResponse: () => [],
}));

import { SurveyFollowUpScreen } from '../SurveyFollowUpScreen';
import { SurveyResultsScreen } from '../SurveyResultsScreen';

const SURVEY_ID = 'survey-1';
const survey = {
  id: SURVEY_ID,
  display_id: 'SRV-21',
  title: 'Q3 진단',
  type: 'outcome',
  status: 'closed',
  primary_managed_system_id: 'system-1',
};

function envelope(code: string) {
  return { code, message: code, request_id: 'r' } as never;
}

function item(id: string, number: number, resolution: 'open' | 'finding' | 'no_follow_up') {
  return {
    response_id: id,
    response_number: number,
    submitted_at: '2026-09-21T00:00:00.000Z',
    low_answers: [],
    resolution,
    finding: null,
    decision: null,
    next_actions:
      resolution === 'open'
        ? [
            { id: 'mark_no_follow_up', availability: 'allowed' },
            {
              id: 'create_finding',
              availability: 'blocked_requestable',
              requestable_permission: { permission: 'finding.manage', managed_system_id: 's' },
            },
          ]
        : [],
  };
}

const READ = {
  survey_id: SURVEY_ID,
  classifiable: true,
  follow_up_needed: true,
  personal_access: true,
  items: [item('r-1', 1, 'open'), item('r-2', 2, 'open'), item('r-3', 3, 'finding')],
} as unknown as OutcomeFollowUpReadDto;

function host(overrides: Partial<HostSeam> = {}) {
  const notices: HostNotice[] = [];
  const seam: HostSeam = {
    canLink: () => true,
    Link: ({ to, children }: HostLinkProps) => <a href={to}>{children}</a>,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    notify: (notice) => {
      notices.push(notice);
      return String(notices.length);
    },
    dismiss: vi.fn(),
    useHere: () => '/platform/survey-here?focus=x',
    useTitle: () => undefined,
    ...overrides,
  };
  return { seam, notices };
}

function mount(node: ReactNode, seam: HostSeam) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HostSeamProvider value={seam}>{node}</HostSeamProvider>
    </QueryClientProvider>,
  );
}

function controller(overrides: Record<string, unknown>) {
  useSurveyResultsController.mockReturnValue({
    survey: { data: survey, error: null, isError: false, isLoading: false, refetch: vi.fn() },
    gate: { canRead: true, gateState: undefined },
    content: { kind: 'loading' },
    followUp: null,
    resultsAreSuccessful: false,
    refetchResults: vi.fn(),
    ...overrides,
  });
}

describe('SurveyResultsScreen under a bare host', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders permission-denied for a denied survey read', () => {
    controller({
      survey: {
        data: undefined,
        error: new ApiError(403, envelope('permission.denied')),
        isError: true,
        isLoading: false,
        refetch: vi.fn(),
      },
    });
    mount(<SurveyResultsScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('Survey 결과')).toBeInTheDocument();
  });

  it('renders the 404 empty state', () => {
    controller({
      survey: {
        data: undefined,
        error: new ApiError(404, envelope('not_found')),
        isError: true,
        isLoading: false,
        refetch: vi.fn(),
      },
    });
    mount(<SurveyResultsScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('Survey를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('삭제되었거나 접근 권한이 없습니다.')).toBeInTheDocument();
  });

  it('renders the error state and retries through refetch', () => {
    const refetch = vi.fn();
    controller({
      survey: {
        data: undefined,
        error: new ApiError(500, envelope('internal')),
        isError: true,
        isLoading: false,
        refetch,
      },
    });
    mount(<SurveyResultsScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('Survey를 불러오지 못했습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the loading state', () => {
    controller({
      survey: { data: undefined, error: null, isError: false, isLoading: true, refetch: vi.fn() },
    });
    mount(<SurveyResultsScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('renders the header (only mapped links) and the results loading line when ready', () => {
    controller({ content: { kind: 'loading' } });
    mount(
      <SurveyResultsScreen surveyId={SURVEY_ID} />,
      host({ canLink: (to) => to === '/surveys' }).seam,
    );
    expect(screen.getByText('결과를 불러오는 중…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Surveys /' })).toHaveAttribute('href', '/surveys');
    expect(screen.queryByRole('link', { name: /후속 조치/ })).not.toBeInTheDocument();
  });

  it('takes the request-access return intent from useHere()', () => {
    controller({
      content: {
        kind: 'ready',
        results: {
          survey_id: SURVEY_ID,
          status: 'closed',
          identity_protected: true,
          response_state: 'visible',
          anonymity_threshold: 5,
          questions: [],
          next_actions: [
            {
              id: 'create_finding',
              availability: 'blocked_requestable',
              requestable_permission: { permission: 'finding.manage', managed_system_id: 's' },
            },
          ],
        },
      },
    });
    mount(<SurveyResultsScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByRole('button', { name: '권한 요청' })).toHaveAttribute(
      'data-return-route-intent',
      '/platform/survey-here?focus=x',
    );
  });
});

function followUpQueries(read: unknown = READ) {
  useSurvey.mockReturnValue({ data: survey, isLoading: false, isError: false, isSuccess: true });
  useSurveyReadGate.mockReturnValue({ canRead: true, gateState: undefined });
  useOutcomeFollowUp.mockReturnValue({ data: read, isLoading: false, isError: false });
  useSurveyResults.mockReturnValue({ data: undefined, isLoading: false, isError: false });
}

describe('SurveyFollowUpScreen states under a bare host', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders loading', () => {
    followUpQueries();
    useSurvey.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mount(<SurveyFollowUpScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('renders not-found', () => {
    followUpQueries();
    useSurvey.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mount(<SurveyFollowUpScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('Survey를 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('renders blocked', () => {
    followUpQueries();
    useSurveyReadGate.mockReturnValue({ canRead: false, gateState: undefined });
    mount(<SurveyFollowUpScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('Survey 결과')).toBeInTheDocument();
  });

  it('renders unavailable for a non-outcome survey, linking back only when mapped', () => {
    followUpQueries();
    useSurvey.mockReturnValue({
      data: { ...survey, type: 'satisfaction' },
      isLoading: false,
      isError: false,
    });
    mount(
      <SurveyFollowUpScreen surveyId={SURVEY_ID} />,
      host({ canLink: (to) => to !== `/surveys/${SURVEY_ID}/results` }).seam,
    );
    expect(screen.getByText('후속 검토를 사용할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '결과로 돌아가기' })).not.toBeInTheDocument();
  });

  it('renders the follow-up error and retries', () => {
    const refetch = vi.fn();
    followUpQueries();
    useOutcomeFollowUp.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    mount(<SurveyFollowUpScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('후속 검토를 불러오지 못했습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the follow-up loading line', () => {
    followUpQueries();
    useOutcomeFollowUp.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mount(<SurveyFollowUpScreen surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByText('후속 검토를 불러오는 중…')).toBeInTheDocument();
  });
});

describe('SurveyFollowUpScreen selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followUpQueries();
  });

  it('auto-selects the first open item and the first item of a new filter when uncontrolled', () => {
    const renderDetail = vi.fn((parts: ClosableDetailParts) => (
      <div data-testid="detail-title">{parts.title}</div>
    ));
    mount(<SurveyFollowUpScreen renderDetail={renderDetail} surveyId={SURVEY_ID} />, host().seam);
    expect(screen.getByTestId('follow-up-row-1')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('detail-title')).toHaveTextContent('응답 #01');
    fireEvent.click(screen.getByRole('button', { name: '해소됨 1' }));
    expect(screen.getByTestId('follow-up-row-3')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('detail-title')).toHaveTextContent('응답 #03');
  });

  it('selects nothing on open or on a filter switch when controlled, and reports row clicks', () => {
    const onSelect = vi.fn();
    const renderDetail = vi.fn((parts: ClosableDetailParts) => (
      <div data-testid="detail-title">{parts.title}</div>
    ));
    mount(
      <SurveyFollowUpScreen
        renderDetail={renderDetail}
        selection={{ selectedId: null, onSelect }}
        surveyId={SURVEY_ID}
      />,
      host().seam,
    );
    expect(renderDetail).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('follow-up-row-2'));
    expect(onSelect).toHaveBeenLastCalledWith('r-2');
    fireEvent.click(screen.getByRole('button', { name: '해소됨 1' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(renderDetail).not.toHaveBeenCalled();
  });

  it('clears a stale selection through onSelect(null) and never renders it', () => {
    const onSelect = vi.fn();
    const renderDetail = vi.fn((parts: ClosableDetailParts) => (
      <div data-testid="detail-title">{parts.title}</div>
    ));
    followUpQueries({ ...READ, items: [item('r-1', 1, 'open')] });
    mount(
      <SurveyFollowUpScreen
        renderDetail={renderDetail}
        selection={{ selectedId: 'gone', onSelect }}
        surveyId={SURVEY_ID}
      />,
      host().seam,
    );
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(renderDetail).not.toHaveBeenCalled();
  });

  it('renders no detail for a selected item when the viewer lacks personal access', () => {
    const onSelect = vi.fn();
    const renderDetail = vi.fn(() => <div>detail</div>);
    followUpQueries({ ...READ, personal_access: false, items: null });
    mount(
      <SurveyFollowUpScreen
        renderDetail={renderDetail}
        selection={{ selectedId: 'r-1', onSelect }}
        surveyId={SURVEY_ID}
      />,
      host().seam,
    );
    expect(renderDetail).not.toHaveBeenCalled();
    expect(screen.getByText('개인 응답 열람 권한이 필요합니다.')).toBeInTheDocument();
  });

  it('opens a deep-linked selection on its own filter', () => {
    const renderDetail = vi.fn((parts: ClosableDetailParts) => (
      <div data-testid="detail-title">{parts.title}</div>
    ));
    mount(
      <SurveyFollowUpScreen
        renderDetail={renderDetail}
        selection={{ selectedId: 'r-3', onSelect: vi.fn() }}
        surveyId={SURVEY_ID}
      />,
      host().seam,
    );
    expect(screen.getByTestId('detail-title')).toHaveTextContent('응답 #03');
  });

  it('hands working detail parts to renderDetail: requestClose clears, a decision notifies through the seam and the intent comes from useHere()', async () => {
    markFollowUp.mockResolvedValue(undefined);
    const onSelect = vi.fn();
    let captured: ClosableDetailParts | undefined;
    const { seam, notices } = host();
    mount(
      <SurveyFollowUpScreen
        renderDetail={(parts) => {
          captured = parts;
          return <section data-testid="bridge-drawer">{parts.body}</section>;
        }}
        selection={{ selectedId: 'r-1', onSelect }}
        surveyId={SURVEY_ID}
      />,
      seam,
    );
    expect(captured?.title).toBe('응답 #01');
    expect(screen.getByRole('button', { name: '권한 요청' })).toHaveAttribute(
      'data-return-route-intent',
      '/platform/survey-here?focus=x',
    );

    fireEvent.click(screen.getByRole('button', { name: '후속 조치 없음…' }));
    fireEvent.change(screen.getByTestId('follow-up-decision-reason'), {
      target: { value: '범위가 제한적입니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '후속 조치 없음' }));
    await waitFor(() =>
      expect(notices).toEqual([{ tone: 'success', message: '후속 조치 없음으로 기록했습니다.' }]),
    );
    expect(markFollowUp).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'r-1' }));
    // The decision closed the detail through the controlled selection.
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));

    onSelect.mockClear();
    act(() => captured?.requestClose());
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('never calls the old onSelect when a pending decision settles after the review unmounted', async () => {
    let settle: () => void = () => {};
    markFollowUp.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const oldOnSelect = vi.fn();
    const newOnSelect = vi.fn();
    const { seam } = host();
    const first = mount(
      <SurveyFollowUpScreen
        renderDetail={(parts) => <section>{parts.body}</section>}
        selection={{ selectedId: 'r-1', onSelect: oldOnSelect }}
        surveyId={SURVEY_ID}
      />,
      seam,
    );
    fireEvent.click(screen.getByRole('button', { name: '후속 조치 없음…' }));
    fireEvent.change(screen.getByTestId('follow-up-decision-reason'), {
      target: { value: '범위가 제한적입니다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '후속 조치 없음' }));
    await waitFor(() => expect(markFollowUp).toHaveBeenCalledTimes(1));

    first.unmount();
    // A new review (another host owner) now holds a different selection.
    mount(
      <SurveyFollowUpScreen
        renderDetail={(parts) => <section>{parts.body}</section>}
        selection={{ selectedId: 'r-2', onSelect: newOnSelect }}
        surveyId={SURVEY_ID}
      />,
      seam,
    );
    await act(async () => {
      settle();
      await Promise.resolve();
    });
    expect(oldOnSelect).not.toHaveBeenCalled();
    expect(newOnSelect).not.toHaveBeenCalled();
  });
});
