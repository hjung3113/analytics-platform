import { type VocListItem, vocListItemSchema } from '@ap/feature-shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VocRow } from '../VocRow';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_VOC: VocListItem = {
  id: '00000000-0000-0000-0000-000000000001',
  display_id: 'VOC-001',
  title: 'Test VOC title',
  primary_managed_system_id: 'ms-aaa',
  analytics_area_id: null,
  reporter_id: 'user-1',
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  similar_count: 0,
  review_postponed_at: null,
  attachment_count: 0,
};

const MANAGED_SYSTEM = {
  name: 'Tableau',
  mark: '#5e6ad2',
  archived: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<VocRow>', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
  });

  it('renders title in default variant', () => {
    render(
      <VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={MANAGED_SYSTEM} />,
    );
    expect(screen.getByText('Test VOC title')).toBeInTheDocument();
  });

  it('renders display_id', () => {
    render(
      <VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={MANAGED_SYSTEM} />,
    );
    expect(screen.getByText('VOC-001')).toBeInTheDocument();
  });

  it('renders ManagedSystemPill name when managedSystem provided', () => {
    render(
      <VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={MANAGED_SYSTEM} />,
    );
    expect(screen.getByText('Tableau')).toBeInTheDocument();
  });

  it('renders the shared unassigned badge when both owner ids are null', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByText('담당자 없음')).toBeInTheDocument();
  });

  it('does NOT render the unassigned badge when an owner is resolved', () => {
    const vocWithOwner: VocListItem = { ...BASE_VOC, owner_user_id: 'user-2' };
    render(
      <VocRow
        voc={vocWithOwner}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        owner={{ display_name: '박서연' }}
      />,
    );
    expect(screen.queryByText('담당자 없음')).not.toBeInTheDocument();
  });

  it('renders the SeverityBadge label on the meta line', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    // SeverityBadge for 'high' renders the Korean label 높음.
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('does NOT render a SeverityBadge when severity is null', () => {
    const vocNoSeverity: VocListItem = { ...BASE_VOC, severity: null };
    render(
      <VocRow voc={vocNoSeverity} selected={false} onSelect={onSelect} managedSystem={null} />,
    );
    expect(screen.queryByText('높음')).not.toBeInTheDocument();
  });

  it('does not render a same-Managed-System peer count in list rows', () => {
    render(
      <VocRow
        voc={{ ...BASE_VOC, similar_count: 4 }}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );

    expect(screen.queryByText(/similar|같은 시스템의 VOC/i)).not.toBeInTheDocument();
  });

  it('renders the attachment count chip when attachment_count > 0', () => {
    render(
      <VocRow
        voc={{ ...BASE_VOC, attachment_count: 3 }}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.getByLabelText('첨부 3개')).toHaveTextContent('3');
  });

  it('does NOT render the attachment count chip when attachment_count is 0', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    expect(screen.queryByLabelText('첨부 0개')).not.toBeInTheDocument();
  });

  it('keeps the attachment count chip without a same-Managed-System peer chip', () => {
    render(
      <VocRow
        voc={{ ...BASE_VOC, attachment_count: 2, similar_count: 5 }}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
      />,
    );
    expect(screen.getByLabelText('첨부 2개')).toHaveTextContent('2');
    expect(screen.queryByText(/similar|같은 시스템의 VOC/i)).not.toBeInTheDocument();
  });

  it('renders amber "분석 영역 없음" when analytics_area_id is null', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByText('분석 영역 없음')).toBeInTheDocument();
  });

  it('renders the resolved area name instead of "분석 영역 없음" when present', () => {
    const vocWithArea: VocListItem = { ...BASE_VOC, analytics_area_id: 'area-1' };
    render(
      <VocRow
        voc={vocWithArea}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        areaName="Finance"
      />,
    );
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.queryByText('분석 영역 없음')).not.toBeInTheDocument();
  });

  it('calls onSelect on click', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    fireEvent.click(screen.getByRole('row'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on Enter key', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect on Space key', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('sets aria-selected=false when not selected', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'false');
  });

  it('sets aria-selected=true when selected', () => {
    render(<VocRow voc={BASE_VOC} selected={true} onSelect={onSelect} managedSystem={null} />);
    expect(screen.getByRole('row')).toHaveAttribute('aria-selected', 'true');
  });

  it('applies the selected-row token + left accent bar when selected', () => {
    render(<VocRow voc={BASE_VOC} selected={true} onSelect={onSelect} managedSystem={null} />);
    const row = screen.getByRole('row');
    // Prototype parity: tinted selected background
    expect(row.className).toContain('bg-surface-row-selected');
    // Left edge bar exists and uses accent-primary color when selected
    const bar = row.querySelector('[data-testid="voc-row-left-bar"]');
    expect(bar).not.toBeNull();
    expect(bar?.className).toContain('bg-accent-primary');
  });

  it('has a bottom border divider on every row', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    const cls = screen.getByRole('row').className;
    expect(cls).toContain('border-b');
    expect(cls).toContain('border-border-subtle');
  });

  it.each([['high'], ['low'], ['medium'], ['critical'], [null]] as const)(
    'draws no left bar on an unselected row (severity %s) and keeps the severity badge',
    (severity) => {
      const voc: VocListItem = { ...BASE_VOC, severity };
      const { container } = render(
        <VocRow voc={voc} selected={false} onSelect={onSelect} managedSystem={null} />,
      );
      expect(screen.queryByTestId('voc-row-left-bar')).toBeNull();
      if (severity === null) expect(container.querySelector('[data-severity]')).toBeNull();
      else expect(container.querySelector('[data-severity]')).not.toBeNull();
    },
  );

  it('draws no left bar on an unselected permission-limited row', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        permissionLimited={true}
      />,
    );
    expect(screen.queryByTestId('voc-row-left-bar')).toBeNull();
  });

  it('left-bar uses accent-primary when selected regardless of severity', () => {
    const vocNull: VocListItem = { ...BASE_VOC, severity: null };
    render(<VocRow voc={vocNull} selected={true} onSelect={onSelect} managedSystem={null} />);
    const bar = screen.getByTestId('voc-row-left-bar');
    expect(bar.className).toContain('bg-accent-primary');
    expect(bar.className).not.toContain('bg-severity');
  });

  it('renders permission-limited variant — title replaced by peek', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        permissionLimited={true}
      />,
    );
    // Title should be absent
    expect(screen.queryByText('Test VOC title')).not.toBeInTheDocument();
    // display_id should be present
    expect(screen.getByText('VOC-001')).toBeInTheDocument();
  });

  it('applies opacity-60 in permission-limited variant', () => {
    render(
      <VocRow
        voc={BASE_VOC}
        selected={false}
        onSelect={onSelect}
        managedSystem={null}
        permissionLimited={true}
      />,
    );
    expect(screen.getByRole('row').className).toContain('opacity-60');
  });

  it('omits the standalone severity glyph when severity is null and has no stripe', () => {
    const vocNoSeverity: VocListItem = { ...BASE_VOC, severity: null };
    const { container } = render(
      <VocRow voc={vocNoSeverity} selected={false} onSelect={onSelect} managedSystem={null} />,
    );
    expect(container.querySelector('[data-severity]')).toBeNull();
    expect(screen.queryByLabelText('심각도 미지정')).not.toBeInTheDocument();
    expect(screen.queryByTestId('voc-row-left-bar')).toBeNull();
  });

  it('renders relative time in trailing area', () => {
    render(<VocRow voc={BASE_VOC} selected={false} onSelect={onSelect} managedSystem={null} />);
    // Should contain some Korean time text
    const rowEl = screen.getByRole('row');
    expect(rowEl.textContent).toMatch(/분|시간|일/);
  });
});

it('hides absent severity after parsing the reporter wire row', () => {
  const { severity: _hidden, ...wire } = BASE_VOC;
  const voc = vocListItemSchema.parse({
    ...wire,
    primary_managed_system_id: BASE_VOC.id,
    reporter_id: BASE_VOC.id,
  });
  const { container } = render(<VocRow voc={voc} selected={false} onSelect={vi.fn()} />);
  expect(container.querySelector('[data-severity]')).toBeNull();
  expect(screen.queryByText('높음')).not.toBeInTheDocument();
  expect(screen.queryByTestId('voc-row-left-bar')).toBeNull();
});

it('announces a triaged medium row once in Korean', () => {
  const voc = vocListItemSchema.parse({
    ...BASE_VOC,
    primary_managed_system_id: BASE_VOC.id,
    reporter_id: BASE_VOC.id,
    severity: 'medium',
    triage_state: 'triaged',
  });
  const { container } = render(<VocRow voc={voc} selected={false} onSelect={vi.fn()} />);
  expect(screen.getAllByRole('img', { name: '심각도 중간' })).toHaveLength(1);
  const indicators = container.querySelectorAll('[data-severity]');
  expect(
    Array.from(indicators).filter((el) => el.getAttribute('aria-hidden') !== 'true'),
  ).toHaveLength(0);
});
