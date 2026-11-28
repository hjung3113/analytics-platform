import { render, screen } from '@testing-library/react';
import type { Survey } from '../../../types';
import { describe, expect, it, vi } from 'vitest';
import { SurveySettings } from '../SurveySettings';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { items: [] }, isLoading: false, isFetching: false, isError: false }),
}));

const survey: Survey = {
  id: 'a1b2c3d4-0000-4111-8222-333344445555',
  workspace_id: '9a1b2c3d-0000-4111-8222-333344445555',
  display_id: 'SRV-12',
  type: 'outcome',
  status: 'draft',
  title: '결과 설문',
  description: null,
  primary_managed_system_id: '3a1b2c3d-0000-4111-8222-333344445555',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: '4a1b2c3d-0000-4111-8222-333344445555',
  opened_at: null,
  closed_at: null,
  created_at: '2026-06-30T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  questions: [],
};

describe('SurveySettings Outcome Survey Task picker', () => {
  it('uses a visible label as the draft Task picker accessible name', () => {
    render(
      <SurveySettings
        survey={survey}
        managedSystemName="System A"
        editable
        outcomeTaskId={null}
        outcomeTask={null}
        hasOutcomeTask={false}
        outcomeTaskLoading={false}
        outcomeTaskLoadError={false}
        onOutcomeTaskChange={vi.fn()}
        onOutcomeTaskClear={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: '효과를 확인할 Task' })).toBeVisible();
  });
});
