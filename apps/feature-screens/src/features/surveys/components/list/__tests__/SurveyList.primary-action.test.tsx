import { registerAnchorLinkHost } from '@/test/anchor-link-host';
import { HeadTargetHost } from '@/test/primary-action-host';
import { render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Survey } from '../../../types';
import { SurveyList } from '../SurveyList';

beforeAll(registerAnchorLinkHost);

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-21',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: '설문 설명',
  primary_managed_system_id: 'managed-system-1',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'actor-1',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

const list = (surveys: Survey[], canCreate = true) => (
  <SurveyList
    surveys={surveys}
    isLoading={false}
    error={null}
    onSelect={vi.fn()}
    onCreate={vi.fn()}
    canCreate={canCreate}
  />
);

describe('SurveyList primary action placement (#1291 B2)', () => {
  it('draws Survey 생성 in the host head, not in the toolbar, for a nonempty list', () => {
    render(<HeadTargetHost>{list([survey])}</HeadTargetHost>);
    expect(within(screen.getByTestId('host-head')).getByTestId('survey-create-button')).toBeInTheDocument();
    expect(within(screen.getByTestId('host-body')).queryByTestId('survey-create-button')).toBeNull();
    expect(screen.getAllByTestId('survey-create-button')).toHaveLength(1);
  });

  it('keeps Survey 생성 in the toolbar without a host target', () => {
    render(list([survey]));
    expect(screen.getAllByTestId('survey-create-button')).toHaveLength(1);
  });

  it('draws no head action for a user who cannot create', () => {
    render(<HeadTargetHost>{list([survey], false)}</HeadTargetHost>);
    expect(screen.queryByTestId('survey-create-button')).toBeNull();
  });

  it('keeps the head action on a truly empty list; the empty state keeps its own opener (#1291 U2)', () => {
    render(<HeadTargetHost>{list([])}</HeadTargetHost>);
    expect(within(screen.getByTestId('host-head')).getByTestId('survey-create-button')).toBeInTheDocument();
    expect(within(screen.getByTestId('host-body')).getByTestId('survey-empty-create-button')).toBeInTheDocument();
  });
});
