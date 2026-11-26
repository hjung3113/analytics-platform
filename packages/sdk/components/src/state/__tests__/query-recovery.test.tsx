import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { defineEndpoint, groupId, spaceId, type ApiResponse, type PageQuery, type PageResult } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useMenuFetch, useMenuQuery } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '../../archetypes/PlatformPage';
import { useRegisterContextEditorFocus } from '../../filters/QueryBarStatus';
import { QueryView } from '../../StateView';
import { PlatformDataTable } from '../../table/PlatformDataTable';

const context = { ...noContext, time: 'apply' as const, selection: 'apply' as const };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), space: spaceId('mars'), icon: House, label: { ko: '개요', en: 'Overview' } }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, path: '/', icon: House,
    label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, permission: 'platform:view',
    requiresScope: true, pageType: 'overview', context, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
type Row = { id: string };
const endpoint = defineEndpoint<PageQuery, PageResult<Row>>({
  id: 'home.rows', menuId: 'home', paramKeys: { page: true, pageSize: true, sorting: true }, permission: 'platform:view', requiresScope: true,
  context: { time: 'apply', selection: 'apply' }, kinds: [], mergeTimeDomain: false,
});
const session = testSession(['platform:view'], { scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 2 }] });
const setup = (menuQuery: NonNullable<Parameters<typeof testAdapter>[0]>['menuQuery'], withFacts = true) => {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
  return testAdapter({ session: () => session, menuQuery, validateScope: async () => ({ status: 'valid', grantedRooms: ['R1'] }),
    listEquipmentFacts: withFacts ? async () => ({ version: '1', items: [
      { equipmentId: 'A', room: 'R1', axes: {} }, { equipmentId: 'B', room: 'R1', axes: {} },
      { equipmentId: 'X', room: 'R2', axes: {} },
    ] }) : undefined,
  });
};
const failed: ApiResponse<PageResult<Row>> = { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'time_domain_mismatch' };
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

function Query() {
  const query = useMenuQuery(endpoint, { page: 0, pageSize: 20, sorting: [] });
  return <QueryView query={query}>{() => null}</QueryView>;
}

it('shows the fixed-equipment reason and both actions in a compact banner with a verified period cap', async () => {
  const adapter = setup(async () => ({
    ...failed, message: 'time_domain_unverified · fixed_equipment_limit: 36/24', recovery: { maxHours: 24 },
  }));
  const openConditions = vi.fn();
  function ConditionsEditor() {
    useRegisterContextEditorFocus(openConditions);
    return null;
  }
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformPage><ConditionsEditor /><Query /><Query /></PlatformPage>
  </PlatformProvider></I18nProvider>);
  const banner = await screen.findByRole('group', { name: '위젯 상태 요약' });
  expect(banner).toHaveAttribute('data-outcome-compact');
  const actions = within(banner);
  expect(actions.getByRole('button', { name: '기간 1일로 줄이기' })).toBeVisible();
  expect(actions.getByRole('button', { name: '조건 열기' })).toBeVisible();
  expect(actions.queryByRole('button', { name: /대 빼고 다시 조회/ })).toBeNull();
  expect(actions.getByText('영향 설비를 빼면 36대가 남아 고정 한도 24대를 넘습니다. 조건에서 설비를 줄이세요.')).toBeVisible();
});

it.each([[['A', 'X']], [['A']]])('keeps out-of-grant equipment out of evidence and selection (%j)', async (affectedEquipmentIds) => {
  const adapter = setup(async () => ({ ...failed, message: 'time_domain_mismatch: A, X', recovery: { affectedEquipmentIds, authorizedEquipmentIds: ['A', 'B', 'X'], maxHours: 24 } }));
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage><Query /></PlatformPage></PlatformProvider></I18nProvider>);
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /대 빼고 다시 조회/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '기술 정보' }));
  expect(screen.getByRole('alert')).toHaveTextContent('fixture');
  expect(screen.queryByText(/A, X/)).toBeNull();
  expect(window.location.search).not.toContain('selectedEquipmentIds');
});

it('writes only the grant-verified remainder from the settled query to the URL', async () => {
  const adapter = setup(async () => ({ ...failed, message: 'time_domain_mismatch: OUTSIDE-GRANT', recovery: { affectedEquipmentIds: ['A'], authorizedEquipmentIds: ['A', 'B'] } }));
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage><Query /></PlatformPage></PlatformProvider></I18nProvider>);
  const exclude = await screen.findByRole('button', { name: /대 빼고 다시 조회/ });
  fireEvent.click(screen.getByRole('button', { name: '기술 정보' }));
  const detail = screen.getByRole('note', { name: '서버 세부' });
  expect(screen.getByRole('alert')).toHaveTextContent('fixture');
  expect(detail).toHaveTextContent('time_domain_mismatch');
  expect(detail).not.toHaveTextContent('OUTSIDE-GRANT');
  fireEvent.click(exclude);
  await waitFor(() => expect(new URLSearchParams(window.location.search).getAll('selectedEquipmentIds')).toEqual(['B']));
});

it('shortens the bound query period when the equipment facts port is unavailable', async () => {
  const adapter = setup(async () => ({
    ...failed, message: 'time_domain_unverified: X', recovery: { affectedEquipmentIds: ['X'], authorizedEquipmentIds: ['B', 'X'], maxHours: 24 },
  }), false);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage><Query /></PlatformPage></PlatformProvider></I18nProvider>);
  const shorten = await screen.findByRole('button', { name: /기간 1일로 줄이기/ });
  expect(screen.queryByRole('button', { name: /대 빼고 다시 조회/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '기술 정보' }));
  expect(screen.getByRole('alert')).not.toHaveTextContent(/\bX\b/);
  fireEvent.click(shorten);
  await waitFor(() => {
    const url = new URLSearchParams(window.location.search);
    expect(url.get('from')).toBe('2026-09-25T09:00:00');
    expect(url.get('to')).toBe('2026-09-26T09:00:00');
    expect(url.has('selectedEquipmentIds')).toBe(false);
  });
});

it('keeps the trace and cap when the bound query discards malformed equipment lists', async () => {
  const adapter = setup(async () => ({
    ...failed, message: 'Unable to aggregate equipment OUTSIDE-GRANT',
    recovery: { affectedEquipmentIds: [' '], authorizedEquipmentIds: [], maxHours: 24 },
  }));
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><PlatformPage><Query /></PlatformPage></PlatformProvider></I18nProvider>);
  await screen.findByRole('button', { name: /기간 1일로 줄이기/ });
  const card = screen.getByRole('alert');
  expect(card).toHaveTextContent('fixture');
  const detail = screen.queryByRole('button', { name: '기술 정보' });
  if (detail) fireEvent.click(detail);
  expect(card).not.toHaveTextContent('OUTSIDE-GRANT');
});

function Tables({ order }: { order: number }) {
  const { fetch, ready } = useMenuFetch(endpoint);
  return ready ? <>{['First', 'Second'].map(ariaLabel => <PlatformDataTable key={ariaLabel} ariaLabel={ariaLabel} title={ariaLabel} preferenceKey={ariaLabel}
    columns={[{ id: 'id', header: 'ID' }]} getRowId={row => row.id} loadPage={fetch}
    urlState={{ page: null, sorting: [{ id: 'id', desc: order === 2 }], onChange: () => {} }} />)}</> : null;
}

it('removes the grouped table recovery while a different sort order is pending', async () => {
  const first = { ...failed, outcome: 'too_large' as const, recovery: { maxHours: 24 } };
  let hold = false;
  const menuQuery = vi.fn(() => hold ? new Promise<ApiResponse<PageResult<Row>>>(() => {}) : Promise.resolve(first));
  const adapter = setup(menuQuery);
  const tree = (order: number) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <PlatformPage><Tables order={order} /></PlatformPage>
  </PlatformProvider></I18nProvider>;
  const view = render(tree(1));
  await screen.findByRole('button', { name: /기간 1일로 줄이기/ });
  hold = true;
  view.rerender(tree(2));
  await waitFor(() => expect(menuQuery).toHaveBeenCalledTimes(4));
  expect(screen.queryByRole('button', { name: /기간 1일로 줄이기/ })).toBeNull();
});
