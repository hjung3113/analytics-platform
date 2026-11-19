import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../lib/api/types';
import { SURVEY_OUTCOME_LINK_COPY } from '../../../../lib/copy/survey-builder';
import { CreateSurveyDialog } from './CreateSurveyDialog';

const mocks = vi.hoisted(() => ({
  createSurvey: vi.fn(),
  reset: vi.fn(),
  systemA: '30000000-0000-4000-8000-000000000003',
  systemB: '30000000-0000-4000-8000-000000000013',
  taskId: '10000000-0000-4000-8000-000000000001',
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (queryKey[0] === 'managed-systems') {
      return {
        data: {
          items: [
            { id: mocks.systemA, name: '시스템 A', archived_at: null },
            { id: mocks.systemB, name: '시스템 B', archived_at: null },
          ],
        },
        isFetching: false,
        isError: false,
      };
    }
    if (queryKey[0] === 'permission-scope') {
      return { data: { scope: { kind: 'all' } }, isFetching: false, isError: false };
    }
    if (queryKey[0] === 'tasks') {
      return {
        data: {
          items: [
            {
              id: mocks.taskId,
              display_id: 'TASK-2540',
              title: '결과 변화 확인',
              primary_managed_system_id: mocks.systemA,
            },
          ],
        },
        isLoading: false,
        isFetching: false,
        isError: false,
      };
    }
    return { data: { items: [] }, isFetching: false, isError: false };
  },
}));

vi.mock('../../hooks/useSurveys', () => ({
  useCreateSurvey: () => ({
    mutateAsync: mocks.createSurvey,
    reset: mocks.reset,
    isPending: false,
    isError: false,
  }),
  useSurveyCopySource: () => ({ data: undefined, error: null, isFetching: false, isError: false }),
  useSurveyCopySources: () => ({
    data: { pages: [] },
    isFetching: false,
    isFetchingNextPage: false,
    isError: false,
    isSuccess: true,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
  useSurveyTemplates: () => ({ data: { items: [] }, isFetching: false, isError: false, refetch: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSurvey.mockResolvedValue({ id: '20000000-0000-4000-8000-000000000002' });
});

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  const optionOrder: Record<string, string[]> = {
    '설문 유형': ['탐색', '검증', '결과'],
    시스템: ['시스템 A', '시스템 B'],
    '응답 익명 보호': ['보호함', '보호하지 않음'],
  };
  const index = optionOrder[name]?.indexOf(option) ?? -1;
  if (index < 0) throw new Error(`Unknown ${name} option: ${option}`);
  const trigger = screen.getByRole('combobox', { name });
  trigger.focus();
  await user.keyboard('{Enter}');
  await screen.findByRole('listbox');
  await user.keyboard('{Home}');
  for (let step = 0; step < index; step += 1) await user.keyboard('{ArrowDown}');
  await user.keyboard('{Enter}');
}

async function prepareOutcomeSurvey(user: ReturnType<typeof userEvent.setup>) {
  render(<CreateSurveyDialog open onClose={() => {}} onCreated={() => {}} />);
  await user.type(screen.getByRole('textbox', { name: '제목' }), 'Task 효과 측정');
  await choose(user, '설문 유형', '결과');
  await choose(user, '시스템', '시스템 A');
    await user.click(screen.getByRole('combobox', { name: '효과를 확인할 Task (선택)' }));
  await user.click(await screen.findByRole('option', { name: 'TASK-2540 · 결과 변화 확인' }));
  await choose(user, '응답 익명 보호', '보호함');
}

describe('Outcome Survey Task picker', () => {
  it.each([
    ['탐색', '문제와 사용 맥락을 탐색합니다.', false],
    ['검증', '가설이나 해결안이 맞는지 확인합니다.', false],
    ['결과', 'Task 조치 후 결과 변화를 확인합니다.', true],
  ])('shows the %s explanation and only shows its Task picker when applicable', async (label, copy, hasPicker) => {
    const user = userEvent.setup();
    render(<CreateSurveyDialog open onClose={() => {}} onCreated={() => {}} />);

    await choose(user, '설문 유형', label);

    expect(screen.getByText(copy)).toBeVisible();
    const picker = screen.queryByRole('combobox', { name: '효과를 확인할 Task (선택)' });
    if (hasPicker) {
      expect(picker).toBeDisabled();
      expect(picker).toHaveAttribute('aria-describedby', 'survey-outcome-task-help');
      expect(screen.getByText('시스템을 먼저 선택하세요')).toBeVisible();
    } else {
      expect(picker).not.toBeInTheDocument();
    }
  });

  it('submits the selected Task only while the Survey remains an Outcome Survey', async () => {
    const user = userEvent.setup();
    await prepareOutcomeSurvey(user);

    await user.click(screen.getByTestId('survey-create-submit'));

    await waitFor(() => expect(mocks.createSurvey).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'outcome',
        primary_managed_system_id: mocks.systemA,
        outcome_task_id: mocks.taskId,
      }),
    ));
  });

  it('shows a field error on the Task picker when the server rejects the selected Task', async () => {
    const user = userEvent.setup();
    await prepareOutcomeSurvey(user);
    mocks.createSurvey.mockRejectedValueOnce(
      new ApiError(422, {
        code: 'validation.failed',
        message: 'Selected Task is not available',
        detail: { fields: [{ path: ['outcome_task_id'], code: 'invalid' }] },
      }),
    );

    await user.click(screen.getByTestId('survey-create-submit'));

    expect(await screen.findByText(SURVEY_OUTCOME_LINK_COPY.taskRejected)).toBeVisible();
    const picker = screen.getByRole('combobox', { name: '효과를 확인할 Task (선택)' });
    expect(picker).toHaveAttribute('aria-invalid', 'true');
    expect(picker.getAttribute('aria-describedby')).toContain('survey-outcome-task-error');
  });

  it('clears the selected Task when the Managed System changes', async () => {
    const user = userEvent.setup();
    await prepareOutcomeSurvey(user);

    await choose(user, '시스템', '시스템 B');
    await user.click(screen.getByTestId('survey-create-submit'));

    await waitFor(() => expect(mocks.createSurvey).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'outcome', primary_managed_system_id: mocks.systemB }),
    ));
    expect(mocks.createSurvey.mock.calls[0]?.[0]).not.toHaveProperty('outcome_task_id');
  });

  it('clears the picker and submitted Task when the Survey type changes', async () => {
    const user = userEvent.setup();
    await prepareOutcomeSurvey(user);

    await choose(user, '설문 유형', '탐색');
    expect(screen.queryByRole('combobox', { name: '효과를 확인할 Task (선택)' })).not.toBeInTheDocument();
    await user.click(screen.getByTestId('survey-create-submit'));

    await waitFor(() => expect(mocks.createSurvey).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'discovery', primary_managed_system_id: mocks.systemA }),
    ));
    expect(mocks.createSurvey.mock.calls[0]?.[0]).not.toHaveProperty('outcome_task_id');
  });
});
