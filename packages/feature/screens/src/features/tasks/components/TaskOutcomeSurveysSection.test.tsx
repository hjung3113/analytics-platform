import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { HostSeamProvider } from '../../../lib/host/host-seam';
import type { HostSeam } from '../../../lib/host/host-seam';
import { TaskOutcomeSurveysSection } from './TaskOutcomeSurveysSection';

const mocks = vi.hoisted(() => ({
  result: { items: [] as unknown[] },
  isPending: false,
  isError: false,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mocks.result,
    isPending: mocks.isPending,
    isError: mocks.isError,
  }),
}));

const seam: HostSeam = {
  canLink: () => false,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
};

beforeEach(() => {
  mocks.result = { items: [] };
  mocks.isPending = false;
  mocks.isError = false;
});

it('shows allowed Outcome Surveys and omits hidden Survey identifiers', () => {
  mocks.result = {
    items: [
      {
        id: 'link-allowed',
        source_type: 'survey',
        target_type: 'task',
        relation_type: 'measures_outcome_of',
        status: 'active',
        visibility_state: 'allowed',
        source_summary: {
          type: 'survey',
          id: 'survey-allowed',
          display_id: 'SRV-2540',
          title: '조치 결과 측정',
          survey_type: 'outcome',
          status: 'draft',
          primary_managed_system_id: 'system-1',
        },
      },
      {
        id: 'link-hidden',
        source_type: 'survey',
        target_type: 'task',
        relation_type: 'measures_outcome_of',
        status: 'active',
        visibility_state: 'hidden',
        source_summary: null,
      },
    ],
  };

  render(
    <HostSeamProvider value={seam}>
      <TaskOutcomeSurveysSection taskId="task-1" managedSystemId="system-1" />
    </HostSeamProvider>,
  );

  expect(screen.getByRole('heading', { name: '효과를 확인하는 설문' })).toBeVisible();
  expect(screen.getByText('SRV-2540 · 조치 결과 측정')).toBeVisible();
  expect(screen.getByText('결과 · 초안')).toBeVisible();
  expect(screen.queryByText(/survey-hidden|hidden/)).not.toBeInTheDocument();
});

it('surfaces a generic read failure without implying the Task has no Surveys', () => {
  mocks.isError = true;

  render(
    <HostSeamProvider value={seam}>
      <TaskOutcomeSurveysSection taskId="task-1" managedSystemId="system-1" />
    </HostSeamProvider>,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('효과를 확인하는 설문을 불러오지 못했습니다.');
  expect(screen.queryByRole('heading', { name: '효과를 확인하는 설문' })).not.toBeInTheDocument();
});
