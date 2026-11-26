import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, NO_FEATURES, spaceId } from '@ap/contracts';
import { House } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionChips, useAnalysisSelectionOutput, usePlatform, useUnsavedGuard, type AnalysisSelectionChip } from '@ap/kernel';
import { PaneScreenProvider, useLeaveRequest, type PaneScreen } from '@ap/kernel/host';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AnalysisSelectionChipZone } from '../AnalysisSelectionChipZone';
import { DockLayout } from '../../dock/DockLayout';

vi.mock('@ap/kernel', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/kernel')>(),
  useAnalysisSelectionChips: vi.fn(),
}));

const equipment = {
  key: 'equip', dimension: 'equipment', label: { ko: '설비', en: 'Equipment' },
  selection: { shape: 'set', values: ['E1', 'E2'] }, after: null, available: true,
  source: { panelId: 'trend', title: { ko: '설비 추세', en: 'Equipment trend' } },
} satisfies AnalysisSelectionChip;
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
  expect(zone().queryByRole('button', { name: /^\+\d+ ›$/ })).toBeNull();
});

it('shows every chip in order with connectors when the row fits', () => {
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment, module, time], clear, clearAll });
  render(<Harness />);
  expect(screen.getByRole('group', { name: '분석 선택' }).textContent)
    .toMatch(/설비 E1 외 1.*›.*module M1.*›.*시간 14:00 – 16:00/);
  expect(zone().getByRole('button', { name: '모두 지우기' })).toBeVisible();
});

it('moves a single workspace selection and clear-all into the keyboard list when its lane narrows', async () => {
  const user = userEvent.setup();
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment], clear, clearAll });
  render(<I18nProvider><AnalysisSelectionChipZone workspace /></I18nProvider>);
  const measure = (laneWidth: number) => {
    act(() => {
      for (const target of observers.keys()) {
        if (target.matches('[data-analysis-chip-probe]')) resize(target, 240);
        if (target.matches('[data-analysis-chip-summary-probe]')) resize(target, 170);
        if (target.matches('[data-analysis-chip-lane]')) resize(target, laneWidth);
      }
    });
  };
  measure(240);
  const inlineClear = zone().getByRole('button', { name: '모두 지우기' });
  inlineClear.focus();
  measure(90);
  const more = zone().getByRole('button', { name: '+1 ›' });
  expect(more).toHaveFocus();
  expect(zone().queryByRole('button', { name: '모두 지우기' })).toBeNull();
  await user.keyboard('{Enter}');
  const list = within(await screen.findByRole('dialog', { name: '분석 선택' }));
  expect(list.getByText('설비 E1 외 1')).toBeVisible();
  await user.click(list.getByRole('button', { name: '모두 지우기' }));
  expect(clearAll).toHaveBeenCalledOnce();
  measure(240);
  expect(zone().getByRole('button', { name: '모두 지우기' })).toBeVisible();
  measure(200);
  const actions = zone().getByRole('button', { name: '설비 E1 외 1 동작' });
  actions.focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('menuitem', { name: '모두 지우기' }));
  expect(clearAll).toHaveBeenCalledTimes(2);
});

it.each([
  ['editor', '설비 E1 외 1', 'checkbox', 'E1'],
  ['action menu', '설비 E1 외 1 동작', 'menuitem', '지우기'],
] as const)('hands off focus from a portaled chip %s when its lane narrows', async (_surface, trigger, role, name) => {
  const user = userEvent.setup();
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({
    chips: [equipment], clear, clearAll, editor: { replace: vi.fn(), availability: new Map() },
  });
  const { container } = render(<I18nProvider><AnalysisSelectionChipZone workspace /></I18nProvider>);
  const lane = container.querySelector('[data-analysis-chip-lane]')!;
  act(() => {
    resize(container.querySelector('[data-analysis-chip-probe]')!, 240);
    resize(container.querySelector('[data-analysis-chip-summary-probe]')!, 170);
    resize(lane, 240);
  });
  zone().getByRole('button', { name: trigger }).focus();
  await user.keyboard('{Enter}');
  const focused = await screen.findByRole(role, { name });
  expect(focused).toHaveFocus();
  expect(screen.getByRole('group', { name: '분석 선택' })).not.toContainElement(focused);
  act(() => resize(lane, 90));
  expect(zone().getByRole('button', { name: '+1 ›' })).toHaveFocus();
});

it('hands off focus from a nested portal the chip action menu owns (submenu, select list)', async () => {
  const user = userEvent.setup();
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment], clear, clearAll });
  const { container } = render(<I18nProvider><AnalysisSelectionChipZone workspace /></I18nProvider>);
  const lane = container.querySelector('[data-analysis-chip-lane]')!;
  act(() => {
    resize(container.querySelector('[data-analysis-chip-probe]')!, 240);
    resize(container.querySelector('[data-analysis-chip-summary-probe]')!, 170);
    resize(lane, 240);
  });
  zone().getByRole('button', { name: '설비 E1 외 1 동작' }).focus();
  await user.keyboard('{Enter}');
  const item = await screen.findByRole('menuitem', { name: '지우기' });
  // A Radix submenu trigger or select trigger points at content mounted in its own portal.
  const nested = document.createElement('div');
  nested.id = 'nested-chip-surface';
  const choice = document.createElement('button');
  choice.textContent = 'Nested choice';
  nested.append(choice);
  document.body.append(nested);
  item.setAttribute('aria-controls', nested.id);
  // The nested content unmounts in the same commit as the menu that owns it.
  const removeChild = document.body.removeChild.bind(document.body);
  const spy = vi.spyOn(document.body, 'removeChild').mockImplementation(<T extends Node>(child: T) => {
    if (child.contains(item) && nested.isConnected) nested.remove();
    return removeChild(child);
  });
  // Radix nests a submenu's layer under its parent menu, so focusing it does not dismiss the parent.
  const keepParentOpen = (event: FocusEvent) => { if (event.target === choice) event.stopImmediatePropagation(); };
  window.addEventListener('focusin', keepParentOpen, true);
  choice.focus();
  window.removeEventListener('focusin', keepParentOpen, true);
  expect(choice).toHaveFocus();
  expect(item).toBeInTheDocument();
  act(() => resize(lane, 90));
  spy.mockRestore();
  expect(nested.isConnected).toBe(false);
  expect(zone().getByRole('button', { name: '+1 ›' })).toHaveFocus();
});

it.each(['body', 'another control'] as const)('leaves focus on %s outside the workspace chip zone during resize', target => {
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment], clear, clearAll });
  const { container } = render(<I18nProvider><button>Outside</button><AnalysisSelectionChipZone workspace /></I18nProvider>);
  const lane = container.querySelector('[data-analysis-chip-lane]')!;
  act(() => {
    resize(container.querySelector('[data-analysis-chip-probe]')!, 240);
    resize(lane, 240);
  });
  const inside = zone().getByRole('button', { name: '모두 지우기' });
  const outside = screen.getByRole('button', { name: 'Outside' });
  inside.focus();
  if (target === 'body') inside.blur();
  else outside.focus();
  const expected = target === 'body' ? document.body : outside;
  expect(expected).toHaveFocus();
  act(() => resize(lane, 90));
  expect(zone().getByRole('button', { name: '+1 ›' })).toBeVisible();
  expect(expected).toHaveFocus();
});

it('measures workspace chips with presentational footprints', () => {
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment], clear, clearAll });
  const { container } = render(<I18nProvider><AnalysisSelectionChipZone workspace /></I18nProvider>);
  for (const selector of ['[data-analysis-chip-probe]', '[data-analysis-chip-summary-probe]']) {
    const probe = container.querySelector(selector)!;
    expect(probe).toHaveTextContent('설비 E1 외 1');
    expect(probe.querySelector('button, a')).toBeNull();
  }
});

it('renders a legacy group inline on the first commit after shrinking to one chip', () => {
  const model = { clear, clearAll };
  const commit = vi.fn(() => zone().queryByRole('button', { name: /^\+\d+ ›$/ })?.textContent);
  function ObserveCommit({ count }: { count: number }) {
    useLayoutEffect(() => { if (count === 1) commit(); }, [count]);
    return <Harness />;
  }
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ ...model, chips: [equipment, module] });
  const { container, rerender } = render(<ObserveCommit count={2} />);
  act(() => {
    resize(screen.getByTestId('row'), 300);
    resize(screen.getByText('조회 요약'), 100);
    resize(container.querySelector('[data-analysis-chip-probe]')!, 400);
  });
  expect(zone().getByRole('button', { name: '+1 ›' })).toBeVisible();
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({ ...model, chips: [equipment] });
  rerender(<ObserveCommit count={1} />);
  expect(commit).toHaveReturnedWith(undefined);
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
  expect(zone().queryByRole('button', { name: /^\+\d+ ›$/ })).toBeNull();
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

it('keeps the writerless arrival first, preserves its clear action and links to the previous screen', async () => {
  const href = '/?v=1&equip=E2';
  const arrival = { ...time, source: undefined, arrival: { href } };
  const mounted = await mountSelections('', undefined, undefined, content => {
    vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [equipment, arrival], clear, clearAll });
    return content;
  });
  expect(zone().getByText('이전 화면에서:')).toBeVisible();
  expect(zone().getByText('시간 14:00 – 16:00')).toBeVisible();
  expect(zone().getAllByRole('button', { name: /선택 지우기/ })[0]).toHaveAccessibleName('시간 선택 지우기');
  expect(zone().queryByRole('img', { name: '시간' })).toBeNull();
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: '시간 14:00 – 16:00 동작' }));
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['지우기']);
  await user.keyboard('{Escape}');
  fireEvent.click(zone().getByRole('button', { name: '시간 선택 지우기' }));
  expect(clear).toHaveBeenCalledExactlyOnceWith('time');
  const back = zone().getByRole('link', { name: '이전 화면으로 돌아가기 (선택 유지)' });
  expect(back).toHaveAttribute('href', href);
  const row = screen.getByTestId('row');
  const probe = mounted.container.querySelector('[data-analysis-chip-probe]')!;
  back.focus();
  act(() => { resize(row, 300); resize(screen.getByText('조회 요약'), 100); resize(probe, 300); });
  expect(zone().getByRole('link', { name: '이전 화면으로 돌아가기 (선택 유지)' })).toBeVisible();
  expect(zone().getByRole('link', { name: '이전 화면으로 돌아가기 (선택 유지)' })).toHaveFocus();
  act(() => resize(row, 500));
  expect(zone().getByRole('link', { name: '이전 화면으로 돌아가기 (선택 유지)' })).toHaveFocus();
  await user.click(zone().getByRole('link', { name: '이전 화면으로 돌아가기 (선택 유지)' }));
  expect(window.location.search).toBe('?v=1&equip=E2');
});

it('names the recorded source menu in the arrival chip and its return link', async () => {
  const arrival = { href: '/?v=1&equip=E2', origin: { menuLabel: { ko: 'HW Time', en: 'HW Time' } } };
  await mountSelections('', undefined, undefined, content => {
    vi.mocked(useAnalysisSelectionChips).mockReturnValue({ chips: [{ ...time, source: undefined, arrival }], clear, clearAll });
    return content;
  });
  expect(zone().getByText('HW Time에서:')).toBeVisible();
  expect(zone().getByRole('link', { name: 'HW Time로 돌아가기 (선택 유지)' })).toHaveAttribute('href', arrival.href);
});

it.each([false, true])('shows the not-applied status only without a reader (hasReader=%s)', async hasReader => {
  const actual = await vi.importActual<typeof import('@ap/kernel')>('@ap/kernel');
  vi.mocked(useAnalysisSelectionChips).mockImplementation(actual.useAnalysisSelectionChips);
  const title = { ko: '시간', en: 'Time' };
  const group = groupId('overview');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: group, label: title, icon: House, space: spaceId('mars') }],
    menus: [{ id: 'home', path: '/', primary: true, group, label: title, description: title, icon: House,
      permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: NO_FEATURES,
      pageKeys: ['days'], contextResetKeys: ['days'],
      analysisSelectionInbound: [{ key: 'days', label: title, shape: 'range', dimension: 'time' }],
      panels: hasReader ? [{ id: 'reader', title, grain: 'daily', endpoints: [], outputs: [], displayInputs: {},
        queryInputs: { page: [{ key: 'days', selection: 'filter' }] } }] : [],
    }] });
  window.history.replaceState(null, '', '/?v=1&days=14:00/16:00');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}><AnalysisSelectionChipZone /></PlatformProvider></I18nProvider>);
  if (hasReader) {
    expect(zone().getByText('시간 14:00 – 16:00')).toBeVisible();
    expect(zone().queryByText('적용 안 됨')).toBeNull();
  } else {
    expect(zone().getByText('적용 안 됨')).toBeVisible();
    expect(zone().getByRole('button', { name: '시간 14:00 – 16:00' })).toHaveAccessibleDescription('이 화면이 이 선택을 조회에 쓰지 않습니다');
  }
});

function SelectionSource() {
  const { highlighted } = useAnalysisSelectionOutput('source', 'equip', { available: ['E1', 'E2', 'E2'] });
  return <button type="button">{highlighted ? '출처 강조 중' : '출처'}</button>;
}

it.each(['{Enter}', ' '] as const)('opens with %j, keeps the source highlighted and restores focus on Escape', async key => {
  await mountSelections('', [equipment], <SelectionSource />);
  const user = userEvent.setup();
  const edit = zone().getByRole('button', { name: 'equipment E1' });
  edit.focus();
  await user.keyboard(key);
  const dialog = within(screen.getByRole('dialog', { name: 'equipment E1' }));
  expect(dialog.getByRole('checkbox', { name: 'E1' })).toHaveFocus();
  expect(screen.getByRole('button', { name: '출처 강조 중' })).toBeVisible();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(edit).toHaveFocus());
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('leaves focus on the outside control that was clicked', async () => {
  await mountSelections('', [equipment], <SelectionSource />);
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: 'equipment E1' }));
  const outside = screen.getByRole('button', { name: '출처 강조 중' });
  await user.click(outside);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(outside).toHaveFocus();
});

it('returns to the chip inside the folded list when its editor closes', async () => {
  const { container } = await mountSelections('&mod=M1', [equipment, module], <SelectionSource />);
  act(() => {
    resize(screen.getByTestId('row'), 300);
    resize(screen.getByText('조회 요약'), 100);
    resize(container.querySelector('[data-analysis-chip-probe]')!, 400);
  });
  const user = userEvent.setup();
  const more = zone().getByRole('button', { name: '+1 ›' });
  await user.click(more);
  const list = within(screen.getByRole('dialog', { name: '분석 선택' }));
  const edit = list.getByRole('button', { name: 'equipment E1' });
  expect(edit).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('checkbox', { name: 'E1' })).toHaveFocus();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(edit).toHaveFocus());
  await user.keyboard('{Escape}');
  await waitFor(() => expect(more).toHaveFocus());
});

it('applies a set edit with reported candidates and still lists unavailable selected values', async () => {
  await mountSelections('&equip=old', [equipment], <SelectionSource />);
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: 'equipment E1 외 1' }));
  const dialog = within(screen.getByRole('dialog', { name: 'equipment E1 외 1' }));
  expect(dialog.getByRole('checkbox', { name: 'E1' })).toBeChecked();
  const unavailable = dialog.getByRole('checkbox', { name: 'old 해당 없음' });
  expect(unavailable).toBeChecked();
  await user.click(unavailable);
  await user.click(dialog.getByRole('checkbox', { name: 'E2' }));
  const selected = () => new URLSearchParams(window.location.search).getAll('equip');
  expect(selected()).toEqual(['E1', 'old']);
  await user.click(dialog.getByRole('button', { name: '적용' }));
  expect(selected()).toEqual(['E1', 'E2']);
  await waitFor(() => expect(zone().getByRole('button', { name: 'equipment E1 외 1' })).toHaveFocus());
});

it('shows the set draft count as values are checked and unchecked', async () => {
  await mountSelections('', [equipment], <SelectionSource />);
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: 'equipment E1' }));
  const dialog = within(screen.getByRole('dialog', { name: 'equipment E1' }));
  expect(dialog.getByText('1개 선택')).toBeVisible();
  await user.click(dialog.getByRole('checkbox', { name: 'E2' }));
  expect(dialog.getByText('2개 선택')).toBeVisible();
  await user.click(dialog.getByRole('checkbox', { name: 'E1' }));
  await user.click(dialog.getByRole('checkbox', { name: 'E2' }));
  expect(dialog.getByText('0개 선택')).toBeVisible();
});

it('moves focus to the fallback if applying an empty set removes the chip', async () => {
  await mountSelections('', [equipment], <SelectionSource />);
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: 'equipment E1' }));
  const dialog = within(screen.getByRole('dialog', { name: 'equipment E1' }));
  await user.click(dialog.getByRole('checkbox', { name: 'E1' }));
  await user.click(dialog.getByRole('button', { name: '적용' }));
  expect(screen.queryByRole('group', { name: '분석 선택' })).toBeNull();
  expect(screen.getByRole('button', { name: '조회 조건 펼치기' })).toHaveFocus();
});

it.each([
  ['inline to folded', '&mod=M1', 150, 400, 'equipment E1', 'equipment E1 외 1', '+1 ›'],
  ['folded to inline', '&equip=E2&mod=M1', 400, 150, 'equipment E1 외 1', '+1 ›', 'equipment E1'],
] as const)('restores edit focus by selection key after Apply and remeasurement: %s', async (direction, extra, before, after, name, applied, target) => {
  const { container } = await mountSelections(extra, [equipment, module], <SelectionSource />);
  const probe = container.querySelector('[data-analysis-chip-probe]')!;
  act(() => {
    resize(screen.getByTestId('row'), 300);
    resize(screen.getByText('조회 요약'), 100);
    resize(probe, before);
  });
  const user = userEvent.setup();
  let controls = zone();
  if (direction === 'folded to inline') {
    await user.click(controls.getByRole('button', { name: '+1 ›' }));
    controls = within(screen.getByRole('dialog', { name: '분석 선택' }));
  }
  await user.click(controls.getByRole('button', { name }));
  const editor = within(screen.getByRole('dialog', { name }));
  await user.click(editor.getByRole('checkbox', { name: 'E2' }));
  await user.click(editor.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(zone().getByRole('button', { name: applied })).toHaveFocus());
  act(() => resize(probe, after));
  await waitFor(() => expect(zone().getByRole('button', { name: target })).toHaveFocus());
});

it.each([['15:00', true], ['17:00', false]] as const)('handles range start %s with end 16:00', async (from, valid) => {
  type Editor = NonNullable<ReturnType<typeof useAnalysisSelectionChips>['editor']>;
  const replace = vi.fn<Editor['replace']>((_key, next, commit) => {
    if (next.shape !== 'range' || next.from > next.to) return false;
    commit?.();
    return true;
  });
  vi.mocked(useAnalysisSelectionChips).mockReturnValue({
    chips: [time], clear, clearAll, editor: { replace, availability: new Map() },
  });
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: '시간 14:00 – 16:00' }));
  const dialog = within(screen.getByRole('dialog', { name: '시간 14:00 – 16:00' }));
  const start = dialog.getByRole('textbox', { name: '시작' });
  expect(start).toHaveValue('14:00');
  expect(dialog.getByRole('textbox', { name: '끝' })).toHaveValue('16:00');
  await user.clear(start);
  await user.type(start, from);
  await user.click(dialog.getByRole('button', { name: '적용' }));
  expect(replace).toHaveBeenCalledExactlyOnceWith('time', { shape: 'range', from, to: '16:00' }, expect.any(Function));
  if (valid) expect(screen.queryByRole('dialog')).toBeNull();
  else expect(dialog.getByRole('alert')).toHaveTextContent('시작은 끝보다 늦을 수 없습니다.');
});

it.each(['pointer', 'keyboard', 'overlapping'] as const)('marks only the source panel during %s chip interaction', async interaction => {
  const panels = ['source', 'receiver'].map(id => ({ id, title: id, render: () => <p>{id} body</p> }));
  await mountSelections('', [equipment], <DockLayout panels={panels} label="Workspace" separatorLabel={() => 'Resize'}
    layout={{ type: 'branch', dir: 'row', sizes: [50, 50], children: panels.map(({ id }) => ({ type: 'group', panels: [id], active: id })) }}
    onLayoutChange={() => {}} />);
  const source = (await screen.findByText('source body')).closest('[data-dock-panel]')!;
  const receiver = (await screen.findByText('receiver body')).closest('[data-dock-panel]')!;
  const mark = 'data-analysis-source-highlighted';
  const clearChip = zone().getByRole('button', { name: 'equipment 선택 지우기' });
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

it('opens and clears from the action menu inside the folded chip list', async () => {
  const { container } = await mountSelections('&mod=M1', [equipment, module]);
  act(() => {
    resize(screen.getByTestId('row'), 300);
    resize(screen.getByText('조회 요약'), 100);
    resize(container.querySelector('[data-analysis-chip-probe]')!, 400);
  });
  const user = userEvent.setup();
  await user.click(zone().getByRole('button', { name: '+1 ›' }));
  const list = within(screen.getByRole('dialog', { name: '분석 선택' }));
  const more = list.getByRole('button', { name: 'equipment E1 동작' });
  await user.click(more);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(more).toHaveFocus();
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('menuitem', { name: '지우기' }));
  expect(new URLSearchParams(window.location.search).has('equip')).toBe(false);
  expect(zone().getByRole('button', { name: 'module 선택 지우기' })).toHaveFocus();
});
