import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { declaredCapabilitiesKey } from '../../../../lib/api/declared-capabilities';
import * as registryReads from '../../../../lib/api/registry-reads';
import { managedSystemsCatalogQuery } from '../../../../lib/cross-system/useManagedSystemNames';
import { adminDetailFixture } from '../../../../test/permission-details';
import { scopeAdminDetailBody, scopeAdminRowBody } from '../../../../test/fixtures/permission-scope';
import { PermissionRequestDecisionForm } from '../permission-request-decision-form';
import { PermissionRequestDetail } from '../permission-request-detail';

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../useDecidePermissionRequest.js', () => ({ useDecidePermissionRequest: () => ({ mutate: state.mutate, reset: vi.fn(), isPending: false }) }));
vi.mock('../../settings/use-workspace-settings.js', () => ({ useWorkspaceSettings: () => ({ data: undefined }) }));
vi.mock('../../../../lib/api/me', () => ({ useMeBridge: () => ({ data: { actor: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } } }) }));

const batchId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const items = ['workspace.read', 'finding.read'].map((capability, index) => adminDetailFixture({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`, requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', requested_capability: capability, requested_managed_system_id: null,
  status: 'pending', revision: index + 1, requested_expiration: null, reason: '업무 조회', created_at: '2026-11-17T00:00:00.000Z', batch_id: batchId,
}));
beforeEach(() => state.mutate.mockReset());
const first = items[0];
const second = items[1];
if (!first || !second) throw new Error('Expected two batch fixtures');

it('renders the final decision in the hosted footer and submits the action chosen in the body', () => {
  render(
    <PermissionRequestDetail
      request={first}
      onClose={() => undefined}
      renderDetail={({ body, footer }) => <><main>{body}</main><footer>{footer}</footer></>}
    />,
  );

  const body = within(screen.getByRole('main'));
  const footer = within(screen.getByRole('contentinfo'));
  expect(body.queryByTestId('permission-decision-submit')).not.toBeInTheDocument();
  expect(footer.getByRole('button', { name: '결정을 선택하세요' })).toBeDisabled();
  fireEvent.click(body.getByRole('button', { name: '거절' }));
  fireEvent.change(body.getByLabelText('사유 · 필수'), { target: { value: '요청 범위 검토' } });
  fireEvent.click(footer.getByRole('button', { name: '거절 처리' }));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject', reason: '요청 범위 검토' }));
});

it('shows the declared capability name in the approval checklist', () => {
  const capability = 'ext.review.inspect';
  const declared = { ...second, requested_capability: capability };
  const queryClient = new QueryClient();
  queryClient.setQueryData(declaredCapabilitiesKey, [{ id: capability, display_name: '검사 결과 조회' }]);
  render(
    <QueryClientProvider client={queryClient}>
      <PermissionRequestDecisionForm request={first} batch={{ id: batchId, items: [first, declared] }} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  expect(screen.getByRole('checkbox', { name: '검사 결과 조회' })).toBeInTheDocument();
  expect(screen.queryByText(capability)).not.toBeInTheDocument();
});

it('partial approval requires one reason and includes every revision with only checked approval ids', () => {
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  expect(screen.getByRole('radiogroup', { name: '승인 만료일' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Finding 조회' }));
  fireEvent.click(screen.getByRole('button', { name: '고른 1개 승인' }));
  expect(state.mutate).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('사유 · 필수'), { target: { value: '조회만 승인합니다' } });
  fireEvent.click(screen.getByRole('button', { name: '고른 1개 승인' }));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve', reason: '조회만 승인합니다', batch: { id: batchId, revisions: { [first.id]: 1, [second.id]: 2 }, approveIds: [first.id] } }));
});

it.each([['거절', 'reject'], ['추가 정보 요청', 'need-more-info']])('%s ignores approval selection and targets the whole batch', (label, action) => {
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Finding 조회' }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('사유 · 필수'), { target: { value: '전체 요청 검토 사유' } });
  fireEvent.click(screen.getByTestId('permission-decision-submit'));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action, batch: expect.objectContaining({ revisions: { [first.id]: 1, [second.id]: 2 } }) }));
});

it('held rows are disabled and unchecked, and unchecked decidable rows require a reason', () => {
  const held = { ...second, effective_access: { ...second.effective_access, decision: { allow: true as const, via: 'direct_grant' as const } } };
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items: [first, held] }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const checks = screen.getAllByRole('checkbox');
  expect(checks[1]).toBeDisabled();
  expect(checks[1]).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText(/이미 가짐/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '고른 1개 승인' }));
  expect(screen.getByLabelText('사유 · 필수')).toHaveFocus();
  expect(state.mutate).not.toHaveBeenCalled();
});

it('zero selection submits validation with an alert and focuses the reason', () => {
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: '고른 0개 승인' }));
  expect(screen.getByRole('alert')).toHaveTextContent('승인할 권한을 하나 이상 고르세요');
  expect(screen.getByLabelText('사유 · 필수')).toHaveFocus();
  expect(state.mutate).not.toHaveBeenCalled();
});

it('offers only approval scopes shared by checked batch members', () => {
  const otherScope = { ...second, approval_scope_candidates: [{ managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }] };
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items: [first, otherScope] }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  expect(screen.queryByRole('combobox', { name: '승인 범위' })).not.toBeInTheDocument();
});

it('unchecks a member that becomes held during a fresh access read', () => {
  const view = render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const held = { ...second, effective_access: { ...second.effective_access, decision: { allow: true as const, via: 'role' as const } } };
  view.rerender(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items: [first, held] }} />);
  expect(screen.getByRole('checkbox', { name: /Finding 조회/ })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('checkbox', { name: /Finding 조회/ })).toBeDisabled();
});

function impactRow(label: string) {
  const row = screen.getByText(label).parentElement;
  if (!row) throw new Error(`Missing impact row for ${label}`);
  return row;
}

it.each(['system', 'site', 'room'] as const)('previews each checked grant with a %s lead row', lead => {
  const system = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const targets = {
    system: { ...first, requested_capability: 'survey.export', requested_managed_system_id: system, approval_scope_candidates: [{ managed_system_id: system }] },
    site: scopeAdminDetailBody(scopeAdminRowBody(second.id, 'site', 'SITE-A')),
    room: scopeAdminDetailBody(scopeAdminRowBody('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'site_room', 'SITE-B', 'RA1')),
  };
  const workspace = { ...second, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', requested_capability: 'explorer.export' };
  const items = [targets[lead], ...Object.values(targets).filter(item => item !== targets[lead]), workspace];
  render(<PermissionRequestDecisionForm request={targets[lead]} batch={{ id: batchId, items }}
    scopeRadios approvalSystemNames={{ [system]: 'Alpha' }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const preview = within(impactRow('승인 후 열리는 것'));
  expect(preview.getByText('설문 데이터 내보내기 · Alpha')).toBeInTheDocument();
  expect(preview.getByText('Site·공정 조회 · Site SITE-A 전체')).toBeInTheDocument();
  expect(preview.getByText('Site·공정 조회 · Site SITE-B · 공정 RA1')).toBeInTheDocument();
  expect(preview.getByText('로그 원본 내보내기 · 전체 시스템')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: '설문 데이터 내보내기' }));
  expect(preview.queryByText('설문 데이터 내보내기 · Alpha')).not.toBeInTheDocument();
  expect(screen.getByTestId('permission-decision-submit')).toHaveAccessibleDescription(/Site SITE-A 전체/);
});

function mountCatalogReview(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

afterEach(() => vi.restoreAllMocks());

it('keeps an unresolved system override disabled during loading and offers retries after failure and omission', async () => {
  const beta = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const request = { ...first, requested_capability: 'survey.export',
    approval_scope_candidates: [{ managed_system_id: null }, { managed_system_id: beta }] };
  let failRead!: (error: Error) => void;
  const read = vi.spyOn(registryReads, 'fetchManagedSystems')
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { failRead = reject; }))
    .mockResolvedValueOnce({ items: [], total: 0 })
    .mockResolvedValueOnce({ items: [{ id: beta, name: 'Beta' } as registryReads.ManagedSystemDto], total: 1 });
  function Review() {
    const catalog = useQuery({ ...managedSystemsCatalogQuery(), retry: false });
    const names = Object.fromEntries((catalog.data?.items ?? []).map(system => [system.id, system.name]));
    return <PermissionRequestDecisionForm request={request} scopeRadios approvalSystemNames={names}
      systemNamesRead={{ isFetching: catalog.isFetching, retry: () => void catalog.refetch() }} />;
  }
  mountCatalogReview(<Review />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  expect(screen.getByRole('radio', { name: '시스템 이름 확인 중' })).toBeDisabled();
  expect(screen.getByTestId('permission-decision-submit')).toBeEnabled();
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  failRead(new Error('Catalog unavailable'));
  const retry = () => screen.findByRole('button', { name: '시스템 이름 다시 불러오기' });
  fireEvent.click(await retry());
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole('radio', { name: '시스템 이름 확인 불가' })).toBeDisabled();
  fireEvent.click(await retry());
  const option = await screen.findByRole('radio', { name: 'Beta' });
  expect(option).toBeEnabled();
  fireEvent.click(option);
  expect(impactRow('승인 후 열리는 것')).toHaveTextContent('Beta');
  fireEvent.change(screen.getByLabelText(/사유/), { target: { value: 'Beta 보고서 검토' } });
  fireEvent.click(screen.getByTestId('permission-decision-submit'));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ grantedManagedSystemId: beta }));
});

it.each(['single', 'batch'] as const)('blocks the concrete requested scope in a %s review until its label resolves', async mode => {
  const system = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const concrete = { ...second, requested_managed_system_id: system, approval_scope_candidates: [{ managed_system_id: system }] };
  const request = mode === 'batch' ? first : concrete;
  const batch = mode === 'batch' ? { batch: { id: batchId, items: [first, concrete] } } : {};
  let failRead!: (error: Error) => void;
  const read = vi.spyOn(registryReads, 'fetchManagedSystems')
    .mockImplementationOnce(() => new Promise((_resolve, reject) => { failRead = reject; }))
    .mockResolvedValueOnce({ items: [{ id: system, name: 'Alpha', slug: 'alpha' } as registryReads.ManagedSystemDto], total: 1 });
  function Review() {
    const catalog = useQuery({ ...managedSystemsCatalogQuery(), retry: false });
    const names = Object.fromEntries((catalog.data?.items ?? []).map(item => [item.id, item.name]));
    return <PermissionRequestDecisionForm request={request} {...batch} scopeRadios approvalSystemNames={names}
      systemNamesRead={{ isFetching: catalog.isFetching, retry: () => void catalog.refetch() }} />;
  }
  mountCatalogReview(<Review />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const submit = screen.getByTestId('permission-decision-submit');
  expect(submit).toBeDisabled();
  expect(impactRow('승인 후 열리는 것')).toHaveTextContent('시스템 이름 확인 중');
  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  failRead(new Error('Catalog unavailable'));
  await screen.findByRole('button', { name: '시스템 이름 다시 불러오기' });
  expect(submit).toBeDisabled();
  fireEvent.click(submit);
  expect(state.mutate).not.toHaveBeenCalled();

  if (mode === 'batch') {
    const member = screen.getByRole('checkbox', { name: /Finding 조회/ });
    fireEvent.click(member);
    expect(submit).toBeEnabled();
    fireEvent.click(member);
    expect(submit).toBeDisabled();
  }

  fireEvent.click(screen.getByRole('button', { name: '시스템 이름 다시 불러오기' }));
  await waitFor(() => expect(submit).toBeEnabled());
  expect(impactRow('승인 후 열리는 것')).toHaveTextContent('Alpha');
  fireEvent.click(submit);
  expect(state.mutate).toHaveBeenCalledTimes(1);
  expect(state.mutate.mock.calls[0]?.[0]).not.toHaveProperty('grantedManagedSystemId');
});
