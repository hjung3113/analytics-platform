import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, NO_FEATURES, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type AnalysisSelectionChip } from '@ap/kernel';
import { PaneScreenProvider } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { House } from 'lucide-react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlatformPage } from '../../archetypes/PlatformPage';
import { installResizeObserver } from '../../dock/__tests__/harness';
import { AnalysisSelectionChipZone } from '../../filters/AnalysisSelectionChipZone';
import { QueryBarExtensionsProvider } from '../../filters/QueryBarExtension';
import { PanelWorkspace, type PanelWorkspacePanel } from '../PanelWorkspace';

const label = (text: string) => ({ ko: text, en: text });
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('analysis'), space: spaceId('mars'), label: label('Analysis'), icon: House }],
  menus: [{
    id: 'home', group: groupId('analysis'), primary: true, path: '/', icon: House,
    label: label('Home'), description: label(''), permission: 'platform:view', requiresScope: false,
    context: noContext, pageType: 'analysis', query: { mode: 'live' }, features: NO_FEATURES, pageKeys: ['equipment', 'comparison'],
    repeatedPageKeys: ['equipment', 'comparison'], contextResetKeys: ['equipment', 'comparison'],
    panels: [{ id: 'chart', title: label('Chart'), grain: 'run', queryInputs: {}, displayInputs: {}, endpoints: [],
      outputs: [{ key: 'equipment', action: 'select', selection: { dimension: 'equipment', shape: 'set' } }] },
    { id: 'compare', title: label('Comparison chart'), grain: 'run', queryInputs: {}, displayInputs: {}, endpoints: [],
      outputs: [{ key: 'comparison', action: 'select', selection: { dimension: 'equipment', shape: 'set' } }] }],
  }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const onDrop = vi.fn();
const rejected = label('This selection is unavailable here');
const hold = '분석 선택 붙잡기';
const hit = vi.fn();
let observer: ReturnType<typeof installResizeObserver>;

beforeEach(() => {
  observer = installResizeObserver();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit });
  window.history.replaceState(null, '', '/?v=1&equipment=E1');
  onDrop.mockClear();
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'elementFromPoint');
  observer.restore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function Pane({ id, children }: { id: string; children: ReactNode }) {
  return <PaneScreenProvider paneId={id} screen={{ menuId: 'home', params: {}, query: 'v=1&equipment=E1' }}
    onChange={() => {}} onLeave={() => {}}>{children}</PaneScreenProvider>;
}

async function mount({ enabled = true, reason, splitBar = false, chartDrop }: {
  enabled?: boolean; reason?: typeof rejected | ((chip: AnalysisSelectionChip) => typeof rejected | undefined);
  splitBar?: boolean; chartDrop?: (chip: AnalysisSelectionChip) => void;
} = {}) {
  const panels: PanelWorkspacePanel[] = [
    { id: 'chart', title: label('Chart'), primary: true, render: () => <button>Chart body</button>,
      ...(chartDrop && { analysisSelectionDrop: { onDrop: chartDrop } }) },
    { id: 'table', title: label('Table'), render: () => <div>Table body</div>,
      ...(enabled && { analysisSelectionDrop: { reason: typeof reason === 'function' ? reason : () => reason, onDrop } }) },
  ];
  const workspace = <PlatformPage><PanelWorkspace panels={panels} persistKey="selection" label={label('Workspace')} initialMode="fit" compactBelow={0}
      initialPreset="split" presets={[{ id: 'split', label: label('Split'), layout: { type: 'branch', dir: 'row', sizes: [1, 1], children: [
        { type: 'group', panels: ['chart'] }, { type: 'group', panels: ['table'] },
      ] } }]} /></PlatformPage>;
  const view = (showChip: boolean) => {
    const bar = <section aria-label="Selection bar">{showChip && <AnalysisSelectionChipZone />}</section>;
    return <I18nProvider><PlatformProvider registry={registry} adapter={adapter} slots={splitBar ? undefined : { contextBar: bar }}>
      {splitBar ? <QueryBarExtensionsProvider>
        <Pane id="body">{workspace}</Pane>
        <Pane id="body">{bar}</Pane>
        <Pane id="other"><section aria-label="Other pane"><AnalysisSelectionChipZone /></section></Pane>
      </QueryBarExtensionsProvider> : workspace}
    </PlatformProvider></I18nProvider>;
  };
  const { container, rerender } = render(view(true));
  const table = await screen.findByText('Table body');
  const chart = await screen.findByRole('button', { name: 'Chart body' });
  const chip = screen.getByRole('region', { name: 'Selection bar' }).querySelector<HTMLButtonElement>('[data-analysis-chip-edit="equipment"]')!;
  const groups = [...container.querySelectorAll<HTMLElement>('.dv-groupview')];
  groups.forEach((group, index) => vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 100, 200, 200)));
  hit.mockImplementation((x: number) => x < 200 ? chart : table);
  return { chip, chart, container, groups, showChip: (show: boolean) => rerender(view(show)) };
}

function pointer(target: Window | Element, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 140 });
  fireEvent(target, Object.assign(event, { pointerId: 1 }));
}

function target(container: HTMLElement) {
  return container.querySelector('[data-selection-drop-panel="table"]');
}

/**
 * Frames run only when the test says so. Observer callbacks can request a refresh frame at any point after the drag starts,
 * and with the jsdom timer a frame may still be pending when the next step runs: the drag then folds the next request into it.
 * Install before the drag starts; `settle` runs every pending frame, including the ones the frames themselves request.
 */
function manualFrames() {
  const queue = new Map<number, FrameRequestCallback>();
  let next = 0;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { next += 1; queue.set(next, callback); return next; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => { queue.delete(handle); });
  return {
    request,
    pending: () => queue.size,
    async settle() {
      for (let round = 0; round < 10; round++) {
        // Observer callbacks arrive as microtasks inside act; then run what they requested.
        await act(async () => {});
        if (queue.size === 0) return;
        const due = [...queue.values()];
        queue.clear();
        await act(async () => { for (const callback of due) callback(performance.now()); });
      }
      throw new Error('drag frames kept requesting new frames');
    },
  };
}

it('announces the refusal of a panel that does not accept analysis selections', async () => {
  const { chip, container } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 150);
  expect(container.querySelector('[data-selection-drop-panel="chart"]')).toHaveAttribute('data-selection-drop-state', 'rejected');
  pointer(window, 'pointerup', 150);
  expect(onDrop).not.toHaveBeenCalled();
  expect(chip).toHaveFocus();
  expect(screen.getAllByRole('status').map(status => status.textContent)).toContain('분석 선택을 받을 수 없는 패널');
});

it('shows whole-panel targets after movement, hovers the table body and drops the dragged chip', async () => {
  const { chip, container } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 8);
  expect(target(container)).toBeNull();
  pointer(window, 'pointermove', 25);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'available');
  pointer(window, 'pointermove', 250);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  pointer(window, 'pointerup', 250);
  expect(onDrop).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: 'equipment', selection: { shape: 'set', values: ['E1'] } }));
  expect(target(container)).toBeNull();
});

it.each(['scroll', 'resize', 'layout change'])('updates the preview and drop under a stationary pointer after %s', async change => {
  const chartDrop = vi.fn();
  const { chip, chart, container, groups } = await mount({ chartDrop });
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');

  const chartGroup = groups[0]!;
  vi.mocked(chartGroup.getBoundingClientRect).mockReturnValue(new DOMRect(100, 110, 200, 200));
  hit.mockReturnValue(chart);
  if (change === 'scroll') fireEvent.scroll(container);
  else if (change === 'resize') observer.touch(element => element === chartGroup, 200);
  else act(() => { chartGroup.style.left = '100px'; });

  const chartTarget = container.querySelector<HTMLElement>('[data-selection-drop-panel="chart"]');
  await waitFor(() => expect(chartTarget).toHaveAttribute('data-selection-drop-state', 'hovered'));
  expect(chartTarget?.style.getPropertyValue('--selection-drop-left')).toBe('100px');
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'available');
  pointer(window, 'pointerup', 250);
  expect(chartDrop).toHaveBeenCalledOnce();
  expect(onDrop).not.toHaveBeenCalled();
});

it('announces a changed drop target when the pointer is released before the preview refreshes', async () => {
  const chartDrop = vi.fn();
  const { chip, chart, container } = await mount({ chartDrop });
  const frames = manualFrames();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');

  await frames.settle();
  hit.mockReturnValue(chart);
  fireEvent.scroll(container);
  // The scroll asks for a preview frame that has not run yet when the pointer is released.
  expect(frames.pending()).toBe(1);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  pointer(window, 'pointerup', 250);

  expect(chartDrop).not.toHaveBeenCalled();
  expect(onDrop).not.toHaveBeenCalled();
  expect(chip).toHaveFocus();
  const status = screen.getByText('놓는 위치가 바뀌었습니다. 다시 끌어 놓으세요.');
  expect(status).toBeVisible();
  expect(status).toHaveAttribute('role', 'status');
});

it('does not schedule a drag refresh when an unrelated node is added outside the dock', async () => {
  const { chip, container } = await mount();
  const frames = manualFrames();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  await frames.settle();
  frames.request.mockClear();

  await act(async () => { container.append(document.createElement('div')); });

  // Nothing is pending after settle, so a request here would show up instead of folding into an earlier frame.
  expect(frames.request).not.toHaveBeenCalled();
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  pointer(window, 'pointerup', 250);
  expect(onDrop).toHaveBeenCalledOnce();
});

it.each(['lostpointercapture', 'chip unmount'])('cleans up on %s and allows the next drag', async end => {
  const { chip, container, showChip } = await mount({ splitBar: true });
  const setPointerCapture = vi.fn();
  Object.defineProperty(chip, 'setPointerCapture', { value: setPointerCapture });

  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 8);
  expect(setPointerCapture).not.toHaveBeenCalled();
  pointer(window, 'pointermove', 250);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');

  if (end === 'lostpointercapture') {
    pointer(chip.firstElementChild!, end, 250);
    expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
    pointer(chip, end, 250);
  } else showChip(false);
  await waitFor(() => expect(target(container)).toBeNull());
  expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  expect(onDrop).not.toHaveBeenCalled();
  if (end === 'chip unmount') showChip(true);
  const next = within(screen.getByRole('region', { name: 'Selection bar' })).getByRole('button', { name: 'equipment E1' });
  pointer(next, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  pointer(window, 'pointerup', 250);
  expect(onDrop).toHaveBeenCalledOnce();
});

it.each(['Escape', 'window blur', 'lost pointer capture', 'pointercancel'])('cancels on %s and restores focus to the chip', async reason => {
  const { chip, chart, container } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  chart.focus();
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  if (reason === 'Escape') fireEvent.keyDown(chart, { key: 'Escape' });
  else if (reason === 'window blur') fireEvent(chip.ownerDocument.defaultView!, new FocusEvent('blur'));
  else if (reason === 'lost pointer capture') pointer(chip, 'lostpointercapture', 250);
  else pointer(window, 'pointercancel', 250);
  expect(target(container)).toBeNull();
  expect(chip).toHaveFocus();
  pointer(window, 'pointerup', 250);
  // The release of a cancelled drag still dispatches a click on the chip: it must not open the chip editor (#2917).
  // pointercancel ends the pointer without a release, so no click follows it.
  if (reason !== 'pointercancel') {
    fireEvent.click(chip, { detail: 1 });
    expect(screen.queryByRole('dialog', { name: 'equipment E1' })).toBeNull();
  }
  expect(onDrop).not.toHaveBeenCalled();
});

it.each([['Escape', 'window blur'], ['window blur', 'lost pointer capture'], ['lost pointer capture', 'window blur']])('keeps the release click suppressed after %s then %s', async (...interrupts) => {
  const { chip, chart } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  chart.focus();
  for (const interrupt of interrupts) {
    if (interrupt === 'Escape') fireEvent.keyDown(chart, { key: 'Escape' });
    else if (interrupt === 'window blur') fireEvent(window, new FocusEvent('blur'));
    else pointer(chip, 'lostpointercapture', 250);
  }
  pointer(window, 'pointerup', 250);
  fireEvent.click(chip, { detail: 1 });
  expect(screen.queryByRole('dialog', { name: 'equipment E1' })).toBeNull();
  expect(onDrop).not.toHaveBeenCalled();
});

it.each(['window blur', 'lost pointer capture'])('starts the next drag after %s when the release never arrived', async reason => {
  const { chip, container } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  if (reason === 'window blur') fireEvent(chip.ownerDocument.defaultView!, new FocusEvent('blur'));
  else pointer(chip, 'lostpointercapture', 250);
  expect(target(container)).toBeNull();
  // The pointer was released outside the window: the next press starts a new drag.
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  pointer(window, 'pointerup', 250);
  expect(onDrop).toHaveBeenCalledOnce();
});

it('keeps dragging when a control inside the window blurs', async () => {
  const { chip, chart, container } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  fireEvent.blur(chart);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  pointer(window, 'pointerup', 250);
  expect(onDrop).toHaveBeenCalledOnce();
});

it('shows the same rejection during drag and in the menu, and neither applies it', async () => {
  const { chip, container } = await mount({ reason: rejected });
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  expect(target(container)).toHaveTextContent(rejected.ko);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'rejected');
  expect(container.querySelector('[data-selection-drop-panel="chart"]')).toHaveTextContent('분석 선택을 받을 수 없는 패널');
  pointer(window, 'pointerup', 250);
  expect(chip).toHaveFocus();
  // The overlay is gone after the release, so the refusal is announced in the drop status (#2917).
  expect(screen.getAllByRole('status').map(status => status.textContent)).toContain(rejected.ko);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Table 동작' }), { key: 'Enter' });
  const action = await screen.findByRole('menuitem', { name: `${hold} · equipment E1`, description: rejected.ko });
  expect(action).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(action);
  expect(onDrop).not.toHaveBeenCalled();
});

it('uses the same selection with the keyboard menu action', async () => {
  const user = userEvent.setup();
  const { chip } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  pointer(window, 'pointerup', 250);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Table 동작' }), { key: 'Enter' });
  const action = await screen.findByRole('menuitem', { name: `${hold} · equipment E1` });
  action.focus();
  await user.keyboard('{Enter}');
  expect(onDrop).toHaveBeenCalledTimes(2);
  expect(onDrop.mock.calls[1]).toEqual(onDrop.mock.calls[0]);
});

it('lists an accepted and rejected chip separately and adds their sources to matching summaries', async () => {
  window.history.replaceState(null, '', '/?v=1&equipment=E1&comparison=E1');
  await mount({ reason: chip => chip.key === 'comparison' ? rejected : undefined });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Table 동작' }), { key: 'Enter' });
  const accepted = await screen.findByRole('menuitem', { name: `${hold} · equipment E1 (Chart)` });
  const blocked = screen.getByRole('menuitem', { name: `${hold} · equipment E1 (Comparison chart)`, description: rejected.ko });
  expect(blocked).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(blocked);
  expect(onDrop).not.toHaveBeenCalled();
  fireEvent.click(accepted);
  expect(onDrop).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: 'equipment' }));
});

it('describes each rejected chip with its own reason', async () => {
  const otherReason = label('This selection has too many values');
  window.history.replaceState(null, '', '/?v=1&equipment=E1&equipment=E2&comparison=E3');
  await mount({ reason: chip => chip.key === 'equipment' ? otherReason : rejected });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Table 동작' }), { key: 'Enter' });
  const blocked = await screen.findByRole('menuitem', { name: `${hold} · equipment E1 외 1`, description: otherReason.ko });
  const other = screen.getByRole('menuitem', { name: `${hold} · equipment E3`, description: rejected.ko });
  expect(blocked).toHaveAttribute('aria-disabled', 'true');
  expect(other).toHaveAttribute('aria-disabled', 'true');
  expect(blocked.getAttribute('aria-describedby')).not.toBe(other.getAttribute('aria-describedby'));
});

it('leaves chip editing and the panel menu unchanged without an opted-in panel', async () => {
  const { chip, container } = await mount({ enabled: false });
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  expect(target(container)).toBeNull();
  pointer(window, 'pointerup', 250);
  expect(chip).not.toHaveClass('cursor-grab');
  await userEvent.click(chip);
  expect(await screen.findByRole('dialog', { name: /equipment E1/ })).toBeVisible();
  fireEvent.keyDown(chip, { key: 'Escape' });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Table 동작' }), { key: 'Enter' });
  expect(await screen.findByRole('menu')).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: new RegExp(hold) })).toBeNull();
  expect(onDrop).not.toHaveBeenCalled();
});

it('connects a separate pane query bar and keeps the other pane’s chip independent', async () => {
  const { chip, container } = await mount({ splitBar: true });
  const otherChip = within(screen.getByRole('region', { name: 'Other pane' })).getByRole('button', { name: 'equipment E1' });
  expect(otherChip).not.toHaveClass('cursor-grab');
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  pointer(window, 'pointerup', 250);
  expect(onDrop).toHaveBeenCalledOnce();
});
