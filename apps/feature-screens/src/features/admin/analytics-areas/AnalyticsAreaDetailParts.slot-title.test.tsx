// The slot title switch (#1168 C-1): the bridge drawer's header already shows the
// area name, so the body omits its title block; the standalone Sheet body keeps it.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildAnalyticsAreaDetailParts } from './AnalyticsAreaDetail';

const AREA = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspace_id: 'ws',
  managed_system_id: '11111111-1111-4111-8111-111111111111',
  slug: 'area-one',
  name: 'Area One',
  owner_team_id: 'team-1',
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
};

const PART_ARGS = {
  area: AREA,
  ms: null,
  resolved: undefined,
  onClose: () => {},
  onEdit: () => {},
};

describe('Analytics Area detail slot title (#1168 C-1)', () => {
  it('the standalone Sheet body renders the area name', () => {
    render(<div>{buildAnalyticsAreaDetailParts(PART_ARGS).body}</div>);

    expect(screen.getByRole('heading', { name: 'Area One' })).toBeInTheDocument();
    expect(screen.getByText('필터 차원')).toBeInTheDocument();
  });

  it('the slot body (titleInHeader) omits the name and keeps the badges', () => {
    render(<div>{buildAnalyticsAreaDetailParts({ ...PART_ARGS, titleInHeader: true }).body}</div>);

    expect(screen.queryByRole('heading', { name: 'Area One' })).toBeNull();
    expect(screen.getByText('필터 차원')).toBeInTheDocument();
  });
});
