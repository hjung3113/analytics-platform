import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
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
  const dialog = screen.getByRole('dialog', { name: '대상' });
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
  expect(within(dialog).getAllByRole('columnheader').map(node => node.textContent)).toEqual(['ID', '제조사']);
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
