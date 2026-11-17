import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PermissionDirectGrantForm } from '../permission-direct-grant-form';
import { configureApiClient } from '../../../../lib/api/client';

const mutations = vi.hoisted(() => ({ single: vi.fn(), batch: vi.fn() }));
vi.mock('../useDirectPermissionGrant.js', () => ({ useDirectPermissionGrant: () => ({ mutateAsync: mutations.single.mockResolvedValue(undefined), reset: vi.fn(), isPending: false }), useDirectPermissionGrantBatch: () => ({ mutateAsync: mutations.batch.mockResolvedValue({ items: [] }), reset: vi.fn(), isPending: false }) }));
vi.mock('../../../../lib/api/me', () => ({ useMeBridge: () => ({ data: { actor: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } } }) }));
const actor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const system = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const group = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '업무 조회', description: null, kind: 'operator', owner: { actor_id: actor, display_name: '작성자' }, capabilities: ['workspace.read', 'voc.read', 'finding.read'], shared_with: [], grant_count: 0, can_edit: true, updated_at: '2026-11-17T00:00:00.000Z' };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); configureApiClient({ basePath: '' }); });

it.each([false, true])('expands operator preset for a system, shows missing items, and clears attribution on manual edit=%s', async manual => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/actors')) return json({ actors: [{ id: actor, display_name: '요청자', actor_type: 'human', role_level: 'user', email: '' }] });
    if (url === '/permission-groups?kind=operator') return json({ items: [group] });
    if (url.includes('grant-options')) return json({ recipient: { id: actor, display_name: '요청자', role_level: 'user' }, self_policy: 'allowed', self_approval_required: false, candidates: [
      { capability: 'workspace.read', managed_system_id: null, governance_required: false, preflight: { state: 'available' } },
      { capability: 'voc.read', managed_system_id: system, governance_required: false, preflight: { state: 'available' } },
    ] });
    throw new Error(url);
  }));
  render(<QueryClientProvider client={new QueryClient()}><PermissionDirectGrantForm open selectionContext="test" draft={{ actorId: actor, capability: 'voc.read', managedSystemId: null, reason: '', expirationDate: '' }} managedSystemNames={{ [system]: 'Alpha' }} activeGrants={[]} cacheReturnedGrant={vi.fn()} onOpenChange={vi.fn()} onCreated={vi.fn()} /></QueryClientProvider>);
  const user = userEvent.setup();
  fireEvent.keyDown(screen.getByRole('combobox', { name: '대상자' }), { key: 'ArrowDown' });
  await user.click(await screen.findByRole('option', { name: /요청자/ }));
  expect(await screen.findByRole('button', { name: '업무 조회' })).toHaveAccessibleDescription(/시스템을 고른 뒤/);
  await user.click(screen.getByRole('button', { name: '업무 조회' }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: '권한 그룹에 적용할 시스템' }), { key: 'ArrowDown' });
  await user.click(screen.getByRole('option', { name: 'Alpha' }));
  expect(screen.getByText(/업무 조회: 부여할 수 없음 · 빠짐:/)).toBeInTheDocument();
  const picker = screen.getByRole('group', { name: '부여 권한 및 범위' });
  expect(within(picker).getAllByRole('checkbox').filter(item => item.hasAttribute('aria-labelledby') && item.getAttribute('aria-checked') === 'true')).toHaveLength(2);
  if (manual) await user.click(within(picker).getByRole('checkbox', { name: /VOC 조회 · Alpha/ }));
  fireEvent.change(screen.getByLabelText('사유 · 필수'), { target: { value: '업무에 필요합니다' } });
  await user.click(screen.getByRole('button', { name: '권한 부여' }));
  await waitFor(() => expect(manual ? mutations.single : mutations.batch).toHaveBeenCalled());
  if (!manual) expect(mutations.batch).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ permission_group_id: group.id, items: [{ capability: 'workspace.read' }, { capability: 'voc.read', managed_system_id: system }] }) }));
  else expect(mutations.single.mock.calls[0]?.[0].body).not.toHaveProperty('permission_group_id');
});
