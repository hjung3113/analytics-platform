import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, type GlobalContext } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSavedView, testSession, testSpace } from '@ap/kernel/testing';
import { TargetPicker } from '../TargetPicker';

const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('test'), space: spaceId('mars'), label: { ko: '검사', en: 'Test' }, icon: House }], menus: [{ id: 'home', group: groupId('test'), path: '/', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: true, context: { ...noContext, roomNames: 'apply' }, pageType: 'overview', pageKeys: [], features: { export: false, savedView: false, annotate: false, compare: false } }] });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(360);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1100);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('applies one process rule from authorized facts, with columns restricted to editable facets', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const apply = vi.fn();
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => ({ version: '1', items: [{ equipmentId: 'E1', room: 'PHOTO', axes: {} }, { equipmentId: 'E2', room: 'ETCH', axes: {} }] }) })}>
    <TargetPicker global={{ scopeId: 'MEM', from: null, to: null, roomNames: null, lineNames: null, prcGroups: null, condition: null, selection: null, membershipBasis: null, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null }} cap={{ ...noContext, roomNames: 'apply' }} onChange={apply} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /조건 적용 · 2대/ })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole('button', { name: /공정 전체/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'PHOTO만 선택' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '조건 적용 · 1대' }));
  expect(apply).toHaveBeenCalledWith({ roomNames: ['PHOTO'] });
});

const baseGlobal = { scopeId: 'MEM', from: null, to: null, roomNames: null, lineNames: null, prcGroups: null, condition: null, selection: null, membershipBasis: null, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null } as const;
const equipmentAxes = [
  { id: 'maker', label: { ko: '제조사', en: 'Maker' }, membershipHistory: true },
  { id: 'team', label: { ko: '팀', en: 'Team' }, membershipHistory: true },
];
const facts = { version: '1', items: [
  { equipmentId: 'E1', room: 'PHOTO', axes: { maker: ['A'], team: ['T1'], lineNames: ['L1'], prcGroups: ['P1'] } },
  { equipmentId: 'E2', room: 'ETCH', axes: { maker: ['B'], team: ['T2'], lineNames: ['L2'], prcGroups: ['P2'] } },
] };

function customGroup(id: string, name: string, target: { fixed: readonly string[] } | { rule: Readonly<Record<string, readonly string[]>> }) {
  return testSavedView({ id, kind: 'custom-group', name, savedScopeId: 'MEM', target });
}

it('shows readable custom groups first, applies their IDs, and labels the closed summary with the group name', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const store = createFakeSavedViewStore([customGroup('g1', 'Photo set', { fixed: ['E1'] })]);
  const session = testSession(['platform:view']);
  const apply = vi.fn();
  function Controlled() {
    const [global, setGlobal] = useState<GlobalContext>(baseGlobal);
    return <TargetPicker global={global} cap={{ ...noContext, condition: 'apply' }} onChange={patch => { apply(patch); setGlobal(previous => ({ ...previous, ...patch })); }} />;
  }
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} equipmentAxes={equipmentAxes} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <Controlled />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /커스텀 그룹/ })).toBeVisible());
  await within(dialog).findByRole('table');
  expect(within(dialog).getAllByRole('columnheader').map(node => node.textContent)).toEqual(['ID', '커스텀 그룹', '제조사', '팀']);
  fireEvent.click(within(dialog).getByRole('button', { name: /커스텀 그룹/ }));
  await waitFor(() => expect(within(dialog).getByRole('checkbox', { name: 'Photo set' })).toBeInTheDocument());
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Photo set' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '조건 적용 · 1대' }));
  expect(apply).toHaveBeenCalledWith({ condition: { customGroup: ['g1'] } });
  await screen.findByRole('button', { name: /커스텀 그룹: Photo set/ });
});

it('keeps a selected missing group visible and selected with its ID and reason', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const store = createFakeSavedViewStore();
  const session = testSession(['platform:view']);
  const apply = vi.fn();
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <TargetPicker global={{ ...baseGlobal, condition: { customGroup: ['gone-9'] } }} cap={{ ...noContext, condition: 'apply' }} onChange={apply} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /gone-9 · not-found/ }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await within(dialog).findByRole('table');
  const missing = await within(dialog).findByRole('checkbox', { name: 'gone-9 · not-found' });
  expect(missing).toBeChecked();
  fireEvent.click(within(dialog).getByRole('button', { name: '조건 적용 · 0대' }));
  expect(apply).toHaveBeenCalledWith({ condition: { customGroup: ['gone-9'] } });
});

it('saves a rule group with public roomNames and shared-group visibility, then selects it in the draft', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const store = createFakeSavedViewStore();
  store.groups = [{ group: { id: 'ops', kind: 'custom', name: 'Ops', memberCount: 1 }, members: [], capabilities: { canView: true, canEditMembers: false, canRename: false, canDelete: false } }];
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <TargetPicker global={baseGlobal} cap={{ ...noContext, roomNames: 'apply', condition: 'apply' }} onChange={vi.fn()} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await within(dialog).findByRole('table');
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /공정 전체/ })).toBeVisible());
  fireEvent.click(within(dialog).getByRole('button', { name: /공정 전체/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'PHOTO만 선택' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '그룹으로 저장' }));
  fireEvent.change(within(dialog).getByRole('textbox', { name: '이름' }), { target: { value: 'Photo only' } });
  await within(dialog).findByRole('radio', { name: '공유 그룹 · Ops' });
  fireEvent.click(within(dialog).getByRole('radio', { name: '공유 그룹 · Ops' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  const selected = await within(dialog).findByRole('checkbox', { name: 'Photo only' });
  await waitFor(() => expect(selected).toBeChecked());
  // The saved notice shows once, and the fixed-only reason the new selection triggers stays hidden after the save.
  expect(within(dialog).getAllByText('그룹을 저장했습니다.')).toHaveLength(1);
  expect(within(dialog).queryByRole('note')).toBeNull();
  expect(store.rows.get('v1')).toMatchObject({ kind: 'custom-group', name: 'Photo only', target: { rule: { roomNames: ['PHOTO'] } }, visibility: { kind: 'groups', groupIds: ['ops'] } });
});

it('blocks nested custom-group rules with the required reason but allows checked rows as fixed targets', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const store = createFakeSavedViewStore([
    customGroup('g1', 'Group One', { fixed: ['E1'] }),
    customGroup('g2', 'Group Two', { fixed: ['E2'] }),
  ]);
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <TargetPicker global={{ ...baseGlobal, condition: { customGroup: ['g1'] } }} cap={{ ...noContext, condition: 'apply', selection: 'apply' }} onChange={vi.fn()} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /Group One/ }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await within(dialog).findByRole('table');
  await within(dialog).findByRole('checkbox', { name: 'Group Two' });
  expect(within(dialog).getByRole('button', { name: '그룹으로 저장' })).toBeDisabled();
  expect(within(dialog).getByRole('note')).toHaveTextContent('커스텀 그룹을 고른 조건은 고정으로만 저장');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'E1 선택' }));
  expect(within(dialog).getByRole('button', { name: '그룹으로 저장' })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole('button', { name: '그룹으로 저장' }));
  fireEvent.change(within(dialog).getByRole('textbox', { name: '이름' }), { target: { value: 'Fixed one' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(store.rows.get('v3')).toMatchObject({ kind: 'custom-group', target: { fixed: ['E1'] } }));
});

it('blocks group saving when an editable facet has no selected values', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const store = createFakeSavedViewStore();
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <TargetPicker global={baseGlobal} cap={{ ...noContext, roomNames: 'apply', condition: 'apply' }} onChange={vi.fn()} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await within(dialog).findByRole('table');
  fireEvent.click(within(dialog).getByRole('button', { name: /공정 전체/ }));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: '전체' }));
  expect(within(dialog).getByRole('button', { name: '그룹으로 저장' })).toBeDisabled();
  expect(within(dialog).getByRole('note')).toHaveTextContent('분류마다 값을 하나 이상 골라 주세요.');
});

it('hides custom-group facets and saving when Condition is not editable', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const store = createFakeSavedViewStore([customGroup('g1', 'Group One', { fixed: ['E1'] })]);
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <TargetPicker global={{ ...baseGlobal, condition: { customGroup: ['g1'] } }} cap={{ ...noContext, roomNames: 'apply' }} onChange={vi.fn()} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(await screen.findByRole('button', { name: '대상 전체' }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  expect(within(dialog).queryByRole('button', { name: /커스텀 그룹/ })).toBeNull();
  expect(within(dialog).queryByRole('button', { name: '그룹으로 저장' })).toBeNull();
});

it('fixes an equipment ID and retains it outside a changed rule, without materializing rule results', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const apply = vi.fn();
  render(<I18nProvider><PlatformProvider registry={registry} equipmentAxes={equipmentAxes} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <TargetPicker global={baseGlobal} cap={{ ...noContext, roomNames: 'apply', selection: 'apply' }} onChange={apply} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: 'E1 선택' }));
  fireEvent.click(screen.getByRole('button', { name: /공정 전체/ }));
  fireEvent.click(screen.getByRole('button', { name: 'ETCH만 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '고정 1대 적용' }));
  expect(apply).toHaveBeenCalledWith({ roomNames: ['ETCH'], selection: ['E1'] });
});

it('preserves carried Context and preset-excluded axes, excludes their facets and fixed-selection UI, and explains asOf counts', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const apply = vi.fn();
  render(<I18nProvider><PlatformProvider registry={registry} equipmentAxes={equipmentAxes} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => facts })}>
    <TargetPicker global={{ ...baseGlobal, lineNames: ['L1'], condition: { maker: ['A'], team: ['T1'] }, selection: ['E2'], membershipBasis: 'asOf' }} cap={{ ...noContext, condition: 'apply' }} presetAxes={['maker']} onChange={apply} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^대상 조건/ }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('대수는 지금 소속 기준');
  expect(within(dialog).queryByRole('button', { name: /팀|Line|공정/ })).toBeNull();
  expect(await screen.findByRole('checkbox', { name: 'A' })).toBeChecked();
  expect(within(dialog).queryByRole('checkbox', { name: /E[12] 선택/ })).toBeNull();
  expect(within(dialog).getAllByRole('columnheader').map(node => node.textContent)).toEqual(['ID', '커스텀 그룹', '제조사']);
  fireEvent.click(within(dialog).getByRole('button', { name: 'B만 선택' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '조건 적용 · 1대' }));
  expect(apply).toHaveBeenCalledWith({ condition: { maker: ['B'], team: ['T1'] } });
});

it('shows an absent facts port as an error with its reason and retry, never as empty data', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session, listEquipmentFacts: undefined })}>
    <TargetPicker global={baseGlobal} cap={{ ...noContext, roomNames: 'apply' }} onChange={vi.fn()} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('호스트가 listEquipmentFacts를 제공하지 않습니다.');
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
});

it('writes a required room as its authorized values when the dialog applies "all" (one granted room)', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=FDRY');
  const requiredRegistry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('test'), space: spaceId('mars'), label: { ko: '검사', en: 'Test' }, icon: House }], menus: [{ id: 'home', group: groupId('test'), path: '/', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: true, context: { ...noContext, time: 'apply', roomNames: 'apply' }, query: { mode: 'apply', required: { context: ['roomNames'] } }, pageType: 'overview', pageKeys: [], features: { export: false, savedView: false, annotate: false, compare: false } }] });
  const apply = vi.fn();
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={requiredRegistry} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => ({ version: '1', items: [{ equipmentId: 'E1', room: 'PHOTO', axes: {} }, { equipmentId: 'E2', room: 'PHOTO', axes: {} }] }) })}>
    <TargetPicker global={{ ...baseGlobal, scopeId: 'FDRY' }} cap={{ ...noContext, roomNames: 'apply' }} onChange={apply} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /조건 적용 · 2대/ })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole('button', { name: /공정 전체/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'PHOTO만 선택' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '조건 적용 · 2대' }));
  expect(apply).toHaveBeenCalledWith({ roomNames: ['PHOTO'] });
});

it('renders an absent constructor axis and applies its selected Condition value', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const apply = vi.fn();
  render(<I18nProvider><PlatformProvider registry={registry} equipmentAxes={[{ id: 'constructor', label: { ko: '생성자', en: 'Constructor' }, membershipHistory: true }]} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => ({ version: '1', items: [
    { equipmentId: 'E1', room: 'PHOTO', axes: { constructor: ['A'] } },
    { equipmentId: 'E2', room: 'ETCH', axes: { constructor: ['B'] } },
  ] }) })}>
    <TargetPicker global={baseGlobal} cap={{ ...noContext, condition: 'apply' }} onChange={apply} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  await screen.findByRole('button', { name: '조건 적용 · 2대' });
  fireEvent.click(screen.getByRole('button', { name: /생성자 전체/ }));
  fireEvent.click(screen.getByRole('button', { name: 'A만 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 1대' }));
  expect(apply).toHaveBeenCalledWith({ condition: { constructor: ['A'] } });
});

it('keeps global room and a roomNames Condition axis independent in facets, counts, cancel and apply', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const apply = vi.fn();
  render(<I18nProvider><PlatformProvider registry={registry} equipmentAxes={[{ id: 'roomNames', label: { ko: '주입 축', en: 'Injected axis' }, membershipHistory: true }]} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => ({ version: '1', items: [
    { equipmentId: 'E1', room: 'PHOTO', axes: { roomNames: ['A'] } },
    { equipmentId: 'E2', room: 'PHOTO', axes: { roomNames: ['B'] } },
    { equipmentId: 'E3', room: 'ETCH', axes: { roomNames: ['A'] } },
  ] }) })}>
    <TargetPicker global={{ ...baseGlobal, roomNames: ['PHOTO'], condition: { roomNames: ['A'] } }} cap={{ ...noContext, roomNames: 'apply', condition: 'apply' }} onChange={apply} />
  </PlatformProvider></I18nProvider>);
  const opener = await screen.findByRole('button', { name: '대상 조건 · 지금 1대 · 공정: PHOTO · 주입 축: A' });
  fireEvent.click(opener);
  expect(await screen.findByRole('checkbox', { name: 'PHOTO' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'A' })).toBeChecked();
  expect(screen.getByRole('group', { name: '공정' })).toHaveTextContent('PHOTO1대');
  expect(screen.getByRole('group', { name: '주입 축' })).toHaveTextContent('B1대');
  expect(screen.getAllByRole('columnheader').map(node => node.textContent)).toEqual(['ID', '커스텀 그룹', '공정', '주입 축']);
  expect(within(screen.getByRole('row', { name: 'E1' })).getAllByRole('cell').map(node => node.textContent)).toEqual(['E1', '', 'PHOTO', 'A']);
  fireEvent.click(screen.getByRole('button', { name: 'B만 선택' }));
  fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: '취소' })[0]);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(opener);
  expect(screen.getByRole('checkbox', { name: 'A' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'B만 선택' }));
  fireEvent.click(screen.getByRole('button', { name: '조건 적용 · 1대' }));
  expect(apply).toHaveBeenCalledWith({ roomNames: ['PHOTO'], condition: { roomNames: ['B'] } });
});

it.each(['revision notification', 'adapter replacement'] as const)('discards an open draft on same-Session %s', async change => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const listeners = new Set<() => void>();
  const makeAdapter = () => testAdapter({ session: () => session, listEquipmentFacts: async () => facts, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } });
  const apply = vi.fn();
  const tree = (adapter: ReturnType<typeof makeAdapter>) => <I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
    <TargetPicker global={baseGlobal} cap={{ ...noContext, roomNames: 'apply' }} onChange={apply} />
  </PlatformProvider></I18nProvider>;
  const { rerender } = render(tree(makeAdapter()));
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  await screen.findByRole('button', { name: '조건 적용 · 2대' });
  fireEvent.click(screen.getByRole('button', { name: /공정 전체/ }));
  fireEvent.click(screen.getByRole('button', { name: 'PHOTO만 선택' }));
  expect(screen.getByRole('button', { name: '조건 적용 · 1대' })).toBeEnabled();
  if (change === 'revision notification') await act(async () => { listeners.forEach(listener => listener()); });
  else rerender(tree(makeAdapter()));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '대상 전체' }));
  expect(await screen.findByRole('button', { name: '조건 적용 · 2대' })).toBeEnabled();
});

it('reuses closed match/count/outside work for canonical picks on parent renders and opening', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session, listEquipmentFacts: async () => facts });
  const includes = vi.spyOn(facts.items[0].axes.maker, 'includes');
  const tree = (condition: { maker: string[] }, selection: string[], from: string | null = null) => <I18nProvider><PlatformProvider registry={registry} equipmentAxes={equipmentAxes} adapter={adapter}>
    <TargetPicker global={{ ...baseGlobal, condition, selection, from }} cap={{ ...noContext, condition: 'apply', selection: 'apply' }} onChange={vi.fn()} />
  </PlatformProvider></I18nProvider>;
  const { rerender } = render(tree({ maker: ['A', 'B'] }, ['E1', 'missing']));
  await screen.findByText('현재 조건 결과 밖 1대 · 선택 유지.');
  const calls = includes.mock.calls.length;
  expect(calls).toBeGreaterThan(0);
  rerender(tree({ maker: ['B', 'A', 'A'] }, ['missing', 'E1', 'E1'], '2026-11-01T00:00:00Z'));
  expect(includes).toHaveBeenCalledTimes(calls);
  fireEvent.click(screen.getByRole('button', { name: '대상 고정 3대' }));
  await screen.findByRole('button', { name: '고정 2대 적용' });
  expect(includes).toHaveBeenCalledTimes(calls);
  fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: '취소' })[0]);
  rerender(tree({ maker: ['B'] }, ['E1']));
  expect(includes.mock.calls.length).toBeGreaterThan(calls);
  expect(screen.getByText('현재 조건 결과 밖 1대 · 선택 유지.')).toBeInTheDocument();
});

it.each([null, ['PHOTO']])('blocks rule saving for an injected roomNames axis with global rooms %j but saves fixed IDs', async roomNames => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?scopeId=MEM');
  const store = createFakeSavedViewStore();
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} savedViews={store} equipmentAxes={[{ id: 'roomNames', label: { ko: '주입 축', en: 'Injected axis' }, membershipHistory: true }]} adapter={testAdapter({ session: () => session, listEquipmentFacts: async () => ({ version: '1', items: [
    { equipmentId: 'E1', room: 'PHOTO', axes: { roomNames: ['A'] } },
    { equipmentId: 'E2', room: 'PHOTO', axes: { roomNames: ['B'] } },
    { equipmentId: 'E3', room: 'ETCH', axes: { roomNames: ['A'] } },
  ] }) })}>
    <TargetPicker global={{ ...baseGlobal, roomNames, condition: { roomNames: ['A'] } }} cap={{ ...noContext, roomNames: 'apply', condition: 'apply', selection: 'apply' }} onChange={vi.fn()} />
  </PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^대상 조건/ }));
  const dialog = await screen.findByRole('dialog', { name: '대상' });
  await within(dialog).findByRole('table');
  expect(within(dialog).getByRole('button', { name: '그룹으로 저장' })).toBeDisabled();
  expect(within(dialog).getByRole('note')).toHaveTextContent('roomNames 축을 고른 조건은 고정으로만 저장');
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'E1 선택' }));
  expect(within(dialog).getByRole('button', { name: '그룹으로 저장' })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole('button', { name: '그룹으로 저장' }));
  fireEvent.change(within(dialog).getByRole('textbox', { name: '이름' }), { target: { value: 'Fixed injected' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
  await waitFor(() => expect(store.rows.get('v1')).toMatchObject({ kind: 'custom-group', target: { fixed: ['E1'] } }));
});
