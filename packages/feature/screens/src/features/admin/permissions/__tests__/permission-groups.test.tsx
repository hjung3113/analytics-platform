import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { GroupEditorFields } from '../permission-group-parts';
import { aggregatePermissionRequests, pickGroupCapabilities } from '../../../../lib/copy/permission-groups';

it('personal editor hides sensitive and administrator capabilities and explains why', () => {
  render(<GroupEditorFields kind="personal" draft={{ name: '', description: '', capabilities: [] }} onChange={vi.fn()} declared={[]} />);
  expect(screen.queryByText('workspace.admin')).not.toBeInTheDocument();
  expect(screen.getByText(/민감 권한과 관리자 권한은 넣을 수 없습니다/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: '업무 권한' } });
});

it('catalog excludes held and unrequestable capabilities and preserves the missing explanation', () => {
  expect(pickGroupCapabilities(['voc.read', 'workspace.admin', 'task.manage'], new Set(['voc.read', 'task.manage']), new Set(['voc.read'])))
    .toEqual({ selected: ['task.manage'], missing: [{ capability: 'voc.read', reason: '이미 가짐' }, { capability: 'workspace.admin', reason: '신청할 수 없음' }] });
});

it('groups batches once and keeps the four status words, with approved winning mixed terminal outcomes', () => {
  const rows = [{ id: 'one', batch_id: 'batch', status: 'rejected' }, { id: 'two', batch_id: 'batch', status: 'approved' }, { id: 'three', batch_id: null, status: 'pending' }];
  expect(aggregatePermissionRequests(rows)).toEqual([{ ...rows[0], status: 'approved', batchItems: rows.slice(0, 2) }, { ...rows[2], batchItems: [rows[2]] }]);
});

it('shows removed capabilities and lets the owner remove them without silently dropping them', () => {
  const change = vi.fn();
  render(<GroupEditorFields kind="personal" draft={{ name: '조회', description: '', capabilities: ['system:removed:read'] }} onChange={change} declared={[]} />);
  expect(screen.getByText(/system:removed:read.*현재 선택할 수 없는 권한/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '빼기' }));
  expect(change).toHaveBeenCalledWith({ name: '조회', description: '', capabilities: [] });
});
