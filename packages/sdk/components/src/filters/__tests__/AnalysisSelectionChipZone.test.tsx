import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, NO_FEATURES, spaceId } from '@ap/contracts';
import { House } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionChips, usePlatform, useUnsavedGuard, type AnalysisSelectionChip } from '@ap/kernel';
import { PaneScreenProvider, useLeaveRequest, type PaneScreen } from '@ap/kernel/host';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisSelectionChipZone } from '../AnalysisSelectionChipZone';
import { DockLayout } from '../../dock/DockLayout';

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

async function mountSelections(extra: string, selections = [equipment, module], children?: ReactNode, wrap = (content: ReactNode) => content) {
  const actual = await vi.importActual<typeof import('@ap/kernel')>('@ap/kernel');
  vi.mocked(useAnalysisSelectionChips).mockImplementation(actual.useAnalysisSelectionChips);
  const title = equipment.source.title;
  const keys = selections.map(chip => chip.key);
  const group = groupId('overview');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: group, label: title, icon: House, space: spaceId('mars') }],
    menus: [{ id: 'home', path: '/', primary: true, group, label: title, description: title, icon: House,
      permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: NO_FEATURES,
      query: { mode: 'live' },
      pageKeys: keys, repeatedPageKeys: keys, contextResetKeys: keys,
      panels: [{ id: 'source', title, grain: 'daily', endpoints: [], queryInputs: {}, displayInputs: {},
        outputs: selections.map(({ key, dimension }) => ({ key, action: 'pick', selection: { shape: 'set', dimension } })) }],
    }] });
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session });
  window.history.replaceState(null, '', `/?v=1&equip=E1${extra}`);
  const disclosureFocus = vi.fn(() => screen.queryByRole('group', { name: '분석 선택' }));
  const { container } = render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter}>{wrap(<Harness onDisclosureFocus={disclosureFocus} />)}{children}</PlatformProvider></I18nProvider>);
  return { container, disclosureFocus };
}

it.each(['pointer', 'keyboard', 'overlapping'] as const)('marks only the source panel during %s chip interaction', async interaction => {
  const panels = ['source', 'receiver'].map(id => ({ id, title: id, render: () => <p>{id} body</p> }));
  await mountSelections('', [equipment], <DockLayout panels={panels} label="Workspace" separatorLabel={() => 'Resize'}
    layout={{ type: 'branch', dir: 'row', sizes: [50, 50], children: panels.map(({ id }) => ({ type: 'group', panels: [id], active: id })) }}
    onLayoutChange={() => {}} />);
  const source = (await screen.findByText('source body')).closest('[data-dock-panel]')!;
  const receiver = (await screen.findByText('receiver body')).closest('[data-dock-panel]')!;
  const mark = 'data-analysis-source-highlighted';
  const clearChip = zone().getByRole('button', { name: /equipment/ });
  const chip = zone().getByText('equipment E1');
  expect(source).not.toHaveAttribute(mark);
  if (interaction !== 'keyboard') fireEvent.pointerEnter(chip);
  if (interaction !== 'pointer') act(() => clearChip.focus());
  expect(source).toHaveAttribute(mark);
  expect(receiver).not.toHaveAttribute(mark);
  if (interaction !== 'keyboard') fireEvent.pointerLeave(chip);
  if (interaction === 'overlapping') expect(source).toHaveAttribute(mark);
  if (interaction !== 'pointer') act(() => clearChip.blur());
  expect(source).not.toHaveAttribute(mark);
});

it.each([
  ['folded two to one', '&mod=M1', '+1 ›', 'equipment 선택 지우기', 'module 선택 지우기'],
  ['inline two to one', '&mod=M1', '', 'module 선택 지우기', 'equipment 선택 지우기'],
  ['one to none', '', '', 'equipment 선택 지우기', '조회 조건 펼치기'],
  ['clear all from the list', '&mod=M1', '+1 ›', '모두 지우기', '조회 조건 펼치기'],
])('moves focus after clearing: %s', async (_case, extra, more, action, target) => {
  const { container, disclosureFocus } = await mountSelections(extra);
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

it.each(['replacement', 'blur', 'synchronous blur'] as const)('handles %s of the remaining focused chip when the row unfolds', async reason => {
  const { container } = await mountSelections('&mod=M1&time=T1', [equipment, module, time]);
  const probe = container.querySelector('[data-analysis-chip-probe]')!;
  act(() => {
    resize(screen.getByTestId('row'), 300);
    resize(screen.getByText('조회 요약'), 100);
    resize(probe, 400);
  });
  expect(zone().getByRole('button', { name: '+2 ›' })).toBeVisible();
  zone().getByRole('button', { name: 'time 선택 지우기' }).focus();
  await userEvent.setup().keyboard('{Enter}');
  const remaining = zone().getByRole('button', { name: 'module 선택 지우기' });
  expect(remaining).toHaveFocus();
  if (reason === 'blur') {
    await act(async () => remaining.blur());
    expect(document.body).toHaveFocus();
  }
  act(() => {
    if (reason === 'synchronous blur') remaining.blur();
    resize(probe, 150);
  });
  expect(zone().queryByRole('button', { name: '+1 ›' })).toBeNull();
  expect(reason === 'replacement' ? zone().getByRole('button', { name: 'module 선택 지우기' }) : document.body).toHaveFocus();
});

it('hands off focus after a pane applies its deferred clear proposal', async () => {
  let apply: (() => void) | undefined;
  function DeferredPane({ children }: { children: ReactNode }) {
    const [pane, setPane] = useState<PaneScreen>({ menuId: 'home', params: {}, query: '?v=1&equip=E1&mod=M1' });
    return <PaneScreenProvider paneId="pane" screen={pane} onLeave={vi.fn()} onChange={next => { apply = () => setPane(next); }}>
      {children}
    </PaneScreenProvider>;
  }
  const { container } = await mountSelections('', [equipment, module], undefined, children => <DeferredPane>{children}</DeferredPane>);
  const clearModule = zone().getByRole('button', { name: 'module 선택 지우기' });
  clearModule.focus();
  await userEvent.setup().keyboard('{Enter}');
  expect(apply).toBeTypeOf('function');
  act(() => resize(container.querySelector('[data-analysis-chip-probe]')!, 150));
  expect(clearModule).toHaveFocus();
  act(() => apply!());
  expect(zone().queryByRole('button', { name: 'module 선택 지우기' })).toBeNull();
  expect(zone().getByRole('button', { name: 'equipment 선택 지우기' })).toHaveFocus();
});

it('keeps focus on another control after a guarded chip clear is cancelled', async () => {
  function GuardedControls() {
    useUnsavedGuard(true, { leaves: 'address' });
    const request = useLeaveRequest();
    const { setPage } = usePlatform();
    return <>
      {request && <button onClick={request.cancel}>머무르기</button>}
      <button onClick={() => setPage({ equip: null }, { replace: true })}>출처에서 지우기</button>
    </>;
  }
  await mountSelections('', [equipment, module], <GuardedControls />);
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: 'equipment 선택 지우기' }));
  await user.click(screen.getByRole('button', { name: '머무르기' }));
  expect(zone().getByText('equipment E1')).toBeVisible();
  const external = screen.getByRole('button', { name: '출처에서 지우기' });
  await user.click(external);
  expect(screen.queryByRole('group', { name: '분석 선택' })).toBeNull();
  expect(external).toHaveFocus();
});
