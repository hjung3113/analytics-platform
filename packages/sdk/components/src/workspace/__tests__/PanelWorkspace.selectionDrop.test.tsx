import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupId, NO_FEATURES, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
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
    context: noContext, pageType: 'analysis', query: { mode: 'live' }, features: NO_FEATURES, pageKeys: ['equipment'],
    repeatedPageKeys: ['equipment'], contextResetKeys: ['equipment'],
    panels: [{ id: 'chart', title: label('Chart'), grain: 'run', queryInputs: {}, displayInputs: {}, endpoints: [],
      outputs: [{ key: 'equipment', action: 'select', selection: { dimension: 'equipment', shape: 'set' } }] }],
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

async function mount({ enabled = true, reason, splitBar = false }: { enabled?: boolean; reason?: typeof rejected; splitBar?: boolean } = {}) {
  const panels: PanelWorkspacePanel[] = [
    { id: 'chart', title: label('Chart'), primary: true, render: () => <button>Chart body</button> },
    { id: 'table', title: label('Table'), render: () => <div>Table body</div>,
      ...(enabled && { analysisSelectionDrop: { reason: () => reason, onDrop } }) },
  ];
  const workspace = <PlatformPage><PanelWorkspace panels={panels} persistKey="selection" label={label('Workspace')} initialMode="fit" compactBelow={0}
      initialPreset="split" presets={[{ id: 'split', label: label('Split'), layout: { type: 'branch', dir: 'row', sizes: [1, 1], children: [
        { type: 'group', panels: ['chart'] }, { type: 'group', panels: ['table'] },
      ] } }]} /></PlatformPage>;
  const bar = <section aria-label="Selection bar"><AnalysisSelectionChipZone /></section>;
  const { container } = render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} slots={splitBar ? undefined : { contextBar: bar }}>
    {splitBar ? <QueryBarExtensionsProvider>
      <Pane id="body">{workspace}</Pane>
      <Pane id="body">{bar}</Pane>
      <Pane id="other"><section aria-label="Other pane"><AnalysisSelectionChipZone /></section></Pane>
    </QueryBarExtensionsProvider> : workspace}
  </PlatformProvider></I18nProvider>);
  const table = await screen.findByText('Table body');
  const chart = await screen.findByRole('button', { name: 'Chart body' });
  const chip = within(screen.getByRole('region', { name: 'Selection bar' })).getByRole('button', { name: 'equipment E1' });
  const groups = [...container.querySelectorAll<HTMLElement>('.dv-groupview')];
  groups.forEach((group, index) => vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 200, 100, 200, 200)));
  hit.mockImplementation((x: number) => x < 200 ? chart : table);
  return { chip, chart, container };
}

function pointer(target: Window | Element, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 140 });
  fireEvent(target, Object.assign(event, { pointerId: 1 }));
}

function target(container: HTMLElement) {
  return container.querySelector('[data-selection-drop-panel="table"]');
}

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

it.each(['Escape', 'window blur', 'pointercancel'])('cancels on %s and restores focus to the chip', async reason => {
  const { chip, chart, container } = await mount();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 250);
  chart.focus();
  expect(target(container)).toHaveAttribute('data-selection-drop-state', 'hovered');
  if (reason === 'Escape') fireEvent.keyDown(chart, { key: 'Escape' });
  else if (reason === 'window blur') fireEvent(chip.ownerDocument.defaultView!, new FocusEvent('blur'));
  else pointer(window, 'pointercancel', 250);
  expect(target(container)).toBeNull();
  expect(chip).toHaveFocus();
  pointer(window, 'pointerup', 250);
  expect(onDrop).not.toHaveBeenCalled();
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
  fireEvent.keyDown(screen.getByRole('button', { name: 'Table 동작' }), { key: 'Enter' });
  const action = await screen.findByRole('menuitem', { name: hold, description: rejected.ko });
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
  const action = await screen.findByRole('menuitem', { name: hold });
  action.focus();
  await user.keyboard('{Enter}');
  expect(onDrop).toHaveBeenCalledTimes(2);
  expect(onDrop.mock.calls[1]).toEqual(onDrop.mock.calls[0]);
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
  expect(screen.queryByRole('menuitem', { name: hold })).toBeNull();
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
