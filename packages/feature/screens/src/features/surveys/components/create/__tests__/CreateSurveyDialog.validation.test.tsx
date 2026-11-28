import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { CreateSurveyDialog } from '../CreateSurveyDialog';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
}));

vi.mock('../../../hooks/useSurveys', () => ({
  useCreateSurvey: () => ({
    mutateAsync: mocks.mutateAsync,
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
  mocks.mutateAsync.mockReset();
  mocks.reset.mockReset();
});

it('keeps submit enabled for invalid input, shows the title error, and focuses the first invalid field', async () => {
  const user = userEvent.setup();
  render(<CreateSurveyDialog open onClose={() => {}} onCreated={() => {}} />);

  const submit = screen.getByTestId('survey-create-submit');
  const title = screen.getByRole('textbox', { name: '제목' });
  expect(submit).toBeEnabled();
  expect(title).not.toHaveAttribute('aria-invalid');

  await user.click(submit);

  expect(screen.getByText('설문 제목을 입력해 주세요.')).toBeVisible();
  expect(title).toHaveAttribute('aria-invalid', 'true');
  expect(title).toHaveFocus();
  expect(mocks.mutateAsync).not.toHaveBeenCalled();
});
