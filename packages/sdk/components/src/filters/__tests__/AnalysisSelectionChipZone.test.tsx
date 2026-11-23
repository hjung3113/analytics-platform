import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, NO_FEATURES, spaceId } from '@ap/contracts';
import { House } from 'lucide-react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionChips, type AnalysisSelectionChip } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisSelectionChipZone } from '../AnalysisSelectionChipZone';

vi.mock('@ap/kernel', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/kernel')>(),
  useAnalysisSelectionChips: vi.fn(),
}));

const equipment: AnalysisSelectionChip = {
  key: 'equip', dimension: 'equipment', label: { ko: '설비', en: 'Equipment' },
  selection: { shape: 'set', values: ['E1', 'E2'] }, after: null, available: true,
  source: { panelId: 'trend', title: { ko: '설비 추세', en: 'Equipment trend' } },
};
const module: AnalysisSelectionChip = {
  ...equipment, key: 'mod', dimension: 'module', label: null, available: false,
  selection: { shape: 'set', values: ['M1'] }, after: 'equip',
};
const time: AnalysisSelectionChip = {
  ...equipment, key: 'time', dimension: 'time', label: { ko: '시간', en: 'Time' },
  selection: { shape: 'range', from: '14:00', to: '16:00' }, after: 'mod',
};
const clear = vi.fn(() => true);
const clearAll = vi.fn(() => true);
const zone = () => within(screen.getByRole('group', { name: '분석 선택' }));
const observers = new Map<Element, ResizeObserverCallback>();

function resize(target: Element, width: number) {
  const observer = observers.get(target);
  if (!observer) throw new Error('Expected a size observer');
  observer([{ target, contentRect: { width, height: 26 } } as ResizeObserverEntry], {} as ResizeObserver);
}

function Harness({ onDisclosureFocus }: { onDisclosureFocus?: () => void } = {}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [summary, setSummary] = useState<HTMLSpanElement | null>(null);
  const disclosure = useRef<HTMLButtonElement>(null);
  return <I18nProvider><div ref={setContainer} data-testid="row">
    <span ref={setSummary}>조회 요약</span>
    {onDisclosureFocus && <button ref={disclosure} onFocus={onDisclosureFocus}>조회 조건 펼치기</button>}
    <AnalysisSelectionChipZone fit={{ container, summary }} fallbackFocus={disclosure} />
  </div></I18nProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { observers.set(target, this.callback); }
    unobserve(target: Element) { observers.delete(target); }
    disconnect() { for (const [target, cb] of observers) if (cb === this.callback) observers.delete(target); }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); observers.clear(); });

it('renders no zone when there are no analysis selections', () => {
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [], clear, clearAll });
  const { container } = render(<I18nProvider><AnalysisSelectionChipZone /></I18nProvider>);
  expect(container).toBeEmptyDOMElement();
});

it('shows the only chip, its source and the inline clear-all action', () => {
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment], clear, clearAll });
  render(<Harness />);
  expect(zone().getByText('설비 E1 외 1')).toBeVisible();
  expect(zone().getByRole('img', { name: '설비 추세' })).toHaveAttribute('title', '설비 추세');
  expect(zone().getByRole('button', { name: '모두 지우기' })).toBeVisible();
  expect(zone().queryByRole('button', { expanded: false })).toBeNull();
});

it('shows every chip in order with connectors when the row fits', () => {
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment, module, time], clear, clearAll });
  render(<Harness />);
  expect(screen.getByRole('group', { name: '분석 선택' }).textContent)
    .toMatch(/설비 E1 외 1.*›.*module M1.*›.*시간 14:00 – 16:00/);
  expect(zone().getByRole('button', { name: '모두 지우기' })).toBeVisible();
});

it('folds on a longer summary, opens the full list by keyboard, and unfolds on resize', async () => {
  const user = userEvent.setup();
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment, module, time], clear, clearAll });
  const { container } = render(<Harness />);
  const row = screen.getByTestId('row');
  const summary = screen.getByText('조회 요약');
  const probe = container.querySelector('[data-analysis-chip-probe]')!;
  act(() => { resize(row, 600); resize(summary, 100); resize(probe, 400); });
  expect(zone().getByText('설비 E1 외 1')).toBeVisible();
  act(() => resize(summary, 250));
  expect(zone().queryByText('설비 E1 외 1')).toBeNull();
  expect(zone().getByText('시간 14:00 – 16:00')).toBeVisible();
  const more = zone().getByRole('button', { name: '+2 ›', expanded: false });
  await user.tab();
  expect(more).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(more).toHaveAttribute('aria-expanded', 'true');
  const list = within(await screen.findByRole('dialog', { name: '분석 선택' }));
  expect(list.getAllByRole('listitem')).toHaveLength(3);
  expect(list.getByRole('button', { name: '시간 선택 지우기' })).toBeVisible();
  fireEvent.click(list.getByRole('button', { name: '모두 지우기' }));
  expect(clearAll).toHaveBeenCalledOnce();
  await user.keyboard('{Escape}');
  act(() => resize(row, 700));
  expect(zone().queryByRole('button', { expanded: false })).toBeNull();
  expect(zone().getByText('설비 E1 외 1')).toBeVisible();
});

it('shows the unavailable label and clears that chip alone', () => {
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [module], clear, clearAll });
  render(<Harness />);
  expect(zone().getByText('해당 없음')).toBeVisible();
  fireEvent.click(zone().getByRole('button', { name: 'module 선택 지우기' }));
  expect(clear).toHaveBeenCalledExactlyOnceWith('mod');
});

it('names the source mark with the chip label when the panel title has a placeholder', () => {
  const source = { ...equipment.source, title: { ko: '{module} · Motion별', en: '{module} · By Motion' } };
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [{ ...equipment, source }], clear, clearAll });
  render(<Harness />);
  expect(zone().getByRole('img', { name: '설비' })).not.toHaveAttribute('title');
});

it.each([
  ['folded two to one', '&mod=M1', '+1 ›', 'equipment 선택 지우기', 'module 선택 지우기'],
  ['inline two to one', '&mod=M1', '', 'module 선택 지우기', 'equipment 선택 지우기'],
  ['one to none', '', '', 'equipment 선택 지우기', '조회 조건 펼치기'],
  ['clear all from the list', '&mod=M1', '+1 ›', '모두 지우기', '조회 조건 펼치기'],
])('moves focus after clearing: %s', async (_case, extra, more, action, target) => {
  const actual = await vi.importActual<typeof import('@ap/kernel')>('@ap/kernel');
  vi.mocked(useAnalysisSelectionChips).mockImplementation(actual.useAnalysisSelectionChips);
  const title = equipment.source.title;
  const keys = [equipment.key, module.key];
  const group = groupId('overview');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: group, label: title, icon: House, space: spaceId('mars') }],
    menus: [{ id: 'home', path: '/', primary: true, group, label: title, description: title, icon: House,
      permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: NO_FEATURES,
      query: { mode: 'live' },
      pageKeys: keys, repeatedPageKeys: keys, contextResetKeys: keys,
      panels: [{ id: 'source', title, grain: 'daily', endpoints: [], queryInputs: {}, displayInputs: {},
        outputs: [equipment, module].map(({ key, dimension }) => ({ key, action: 'pick', selection: { shape: 'set', dimension } })) }],
    }] });
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  window.history.replaceState(null, '', `/?v=1&equip=E1${extra}`);
  const disclosureFocus = vi.fn(() => screen.queryByRole('group', { name: '분석 선택' }));
  const { container } = render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}><Harness onDisclosureFocus={disclosureFocus} /></PlatformProvider></I18nProvider>);
  const user = userEvent.setup();
  if (more) {
    act(() => {
      resize(screen.getByTestId('row'), 300);
      resize(screen.getByText('조회 요약'), 100);
      resize(container.querySelector('[data-analysis-chip-probe]')!, 400);
    });
    zone().getByRole('button', { name: more }).focus();
    await user.keyboard('{Enter}');
  }
  const controls = more ? within(await screen.findByRole('dialog', { name: '분석 선택' })) : zone();
  controls.getByRole('button', { name: action }).focus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(screen.getByRole('button', { name: target })).toHaveFocus());
  expect(screen.queryByRole('dialog', { name: '분석 선택' })).toBeNull();
  if (target === '조회 조건 펼치기') expect(disclosureFocus).toHaveReturnedWith(null);
  else expect(zone().queryByRole('button', { name: action })).toBeNull();
});
