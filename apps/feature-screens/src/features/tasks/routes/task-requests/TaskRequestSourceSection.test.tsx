import { shortId } from '@/lib/identity';
import type { FindingDto, TaskRequestDto } from '@ap/feature-shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskRequestSourceSection } from './TaskRequestSourceSection';

const SOURCE_ID = '40000000-0000-0000-0000-000000000004';

function makeFinding(fields: { title: string; summary: string }): FindingDto {
  return {
    id: '60000000-0000-0000-0000-000000000006',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'FIN-17',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    ...fields,
    source_type: 'manual',
    source_id: null,
    owner_actor_id: null,
    owner_team_id: null,
    evidence_count: 0,
    severity: 'high',
    confidence: 'medium',
    status: 'active',
    analytics_area_id: null,
    linked_task_id: null,
    linked_milestone_id: null,
    created_by: '20000000-0000-0000-0000-000000000002',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    source: null,
  } as FindingDto;
}

function makeItem(
  sourceType: 'voc' | 'voc_cluster' | 'finding',
  source: Partial<NonNullable<TaskRequestDto['source']>> | null,
): TaskRequestDto {
  return {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'REQ-42',
    source_type: sourceType,
    source_id: SOURCE_ID,
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    evidence_summary: '로그인 흐름에서 오류가 발생합니다.',
    requested_outcome: '로그인 오류를 수정합니다.',
    requester_actor_id: '20000000-0000-0000-0000-000000000002',
    status: 'pending_review',
    assigned_reviewer_actor_id: null,
    assigned_reviewer_team_id: null,
    reviewer_actor_id: null,
    decision_reason: null,
    decided_at: null,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    ...(source
      ? {
          source: {
            type: sourceType,
            id: SOURCE_ID,
            relation_type: 'requested_task' as const,
            link_id: '50000000-0000-0000-0000-000000000005',
            ...source,
          },
        }
      : {}),
  };
}

const KIND_LABEL = { voc: 'VOC', voc_cluster: 'VOC Cluster' } as const;

describe('Task Request source section for VOC and Cluster origins (#1243)', () => {
  it.each(['voc', 'voc_cluster'] as const)(
    '%s shows the display id and title when the payload carries both',
    (type) => {
      render(
        <TaskRequestSourceSection
          item={makeItem(type, { display_id: 'V-204', title: '로그인 지연' })}
          sourceFinding={undefined}
        />,
      );
      expect(screen.getByText(`출처 ${KIND_LABEL[type]}`)).toBeInTheDocument();
      expect(screen.getByText('V-204')).toBeInTheDocument();
      expect(screen.getByText('로그인 지연')).toBeInTheDocument();
      expect(screen.queryByText(shortId(SOURCE_ID))).not.toBeInTheDocument();
    },
  );

  it.each([
    ['voc', { display_id: 'V-204' }],
    ['voc', { title: '로그인 지연' }],
    ['voc', null],
    ['voc_cluster', { display_id: 'C-9' }],
    ['voc_cluster', { title: '로그인 클러스터' }],
    ['voc_cluster', null],
  ] as const)('%s with %j falls back to the short id and evidence summary', (type, source) => {
    render(<TaskRequestSourceSection item={makeItem(type, source)} sourceFinding={undefined} />);
    expect(screen.getByText(`출처 ${KIND_LABEL[type]}`)).toBeInTheDocument();
    expect(screen.getByText(shortId(SOURCE_ID))).toBeInTheDocument();
    expect(screen.getByText('로그인 흐름에서 오류가 발생합니다.')).toBeInTheDocument();
    for (const leaked of ['V-204', 'C-9', '로그인 지연', '로그인 클러스터']) {
      expect(screen.queryByText(leaked)).not.toBeInTheDocument();
    }
  });
});

// C-2 (#1168): the summary line hides when it is the untouched default the request
// form was seeded with, compared per source kind against its own builder; a
// user-written summary always shows.
describe('Task Request source card default summary (#1168 C-2)', () => {
  const SOURCE = { display_id: 'V-204', title: '로그인 지연' } as const;

  it('voc: hides the summary line when it repeats the seeded VOC default', () => {
    // The stored request carries the default; the builder builds the same string.
    const item = {
      ...makeItem('voc', SOURCE),
      evidence_summary: `VOC ${SOURCE.display_id}: ${SOURCE.title}`,
    };
    render(<TaskRequestSourceSection item={item} sourceFinding={undefined} />);

    expect(screen.getByText('로그인 지연')).toBeInTheDocument();
    expect(screen.queryByText(`VOC ${SOURCE.display_id}: ${SOURCE.title}`)).toBeNull();
  });

  it('voc: shows a user-written summary unchanged', () => {
    render(
      <TaskRequestSourceSection
        item={{ ...makeItem('voc', SOURCE), evidence_summary: '3건의 반복 접수 근거' }}
        sourceFinding={undefined}
      />,
    );

    expect(screen.getByText('3건의 반복 접수 근거')).toBeInTheDocument();
  });

  it('voc_cluster: hides the title-only default of a cluster without a summary', () => {
    const item = {
      ...makeItem('voc_cluster', SOURCE),
      evidence_summary: SOURCE.title,
    };
    render(<TaskRequestSourceSection item={item} sourceFinding={undefined} />);

    expect(screen.getByText('로그인 지연')).toBeInTheDocument();
    expect(screen.queryByText(`VOC ${SOURCE.display_id}: ${SOURCE.title}`)).toBeNull();
  });

  it('voc_cluster: keeps a stored summary that is not recognizable from the payload', () => {
    const item = {
      ...makeItem('voc_cluster', SOURCE),
      evidence_summary: '클러스터에 저장된 요약',
    };
    render(<TaskRequestSourceSection item={item} sourceFinding={undefined} />);

    expect(screen.getByText('클러스터에 저장된 요약')).toBeInTheDocument();
  });

  it('finding: hides the summary line only when it repeats the title shown above', () => {
    const finding = makeFinding({ title: '출처 Finding 제목', summary: '출처 Finding 제목' });
    const item = { ...makeItem('finding', null), evidence_summary: finding.title };
    render(<TaskRequestSourceSection item={item} sourceFinding={finding} />);

    expect(screen.getByText('출처 Finding 제목')).toBeInTheDocument();
    expect(screen.queryByText('출처 Finding 요약')).toBeNull();
  });

  it('finding: shows the seeded finding summary when it differs from the title', () => {
    const finding = makeFinding({ title: '출처 Finding 제목', summary: '출처 Finding 요약' });
    const item = { ...makeItem('finding', null), evidence_summary: finding.summary };
    render(<TaskRequestSourceSection item={item} sourceFinding={finding} />);

    expect(screen.getByText('출처 Finding 제목')).toBeInTheDocument();
    expect(screen.getByText('출처 Finding 요약')).toBeInTheDocument();
  });
});
