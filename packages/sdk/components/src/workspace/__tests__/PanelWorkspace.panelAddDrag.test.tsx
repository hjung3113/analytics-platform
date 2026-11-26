import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { installResizeObserver } from '../../dock/__tests__/harness';
import { PanelAddMenu, PanelWorkspace, type PanelWorkspaceProps } from '../../index';

const observer = installResizeObserver();
beforeAll(() => { observer.resize(1200); });
afterAll(() => { observer.restore(); });
afterEach(() => { cleanup(); });
const label = (ko: string) => ({ ko, en: ko });
const panels: PanelWorkspaceProps['panels'] = [
  { id: 'trend', title: label('추세'), primary: true, render: () => null },
  { id: 'detail', title: label('상세'), render: () => null },
  { id: 'dist', title: label('분포'), placement: 'below', render: () => null },
];
const items = [...panels, { id: 'disabled', title: label('비활성'), disabledReason: label('이 단계에서는 쓸 수 없음') }];
const presets: PanelWorkspaceProps['presets'] = [{ id: 'default', label: label('기본'), layout: { type: 'branch', dir: 'row', sizes: [50, 50],
  children: [{ type: 'group', panels: ['trend'] }, { type: 'group', panels: ['detail'] }] } }];

const defaultPanels = [
  ...panels.slice(0, 2),
  { id: 'summary', title: label('요약'), render: () => null },
  { ...panels[2]!, placement: undefined },
];
const defaultPresets: PanelWorkspaceProps['presets'] = [{ ...presets[0]!, layout: { type: 'branch', dir: 'row', sizes: [50, 50],
  children: [{ type: 'group', panels: ['trend', 'summary'], active: 'trend' }, { type: 'group', panels: ['detail'] }] } }];

async function mount(options: { enabled: boolean; chartPicker?: boolean; stack?: boolean; maximize?: boolean; defaultPlacement?: boolean }) {
  const onAdd = vi.fn();
  const storage = { getItem: () => null, setItem: vi.fn() };
  const rowId = options.chartPicker ? 'distribution' : 'dist';
  const catalog = items.map(item => item.id === 'dist' ? { ...item, id: rowId } : item);
  const declared = options.defaultPlacement ? defaultPanels : panels;
  function Demo({ add = onAdd }: { add?: typeof onAdd }) {
    const [added, setAdded] = useState(false);
    return <PanelWorkspace panels={added ? declared : declared.slice(0, -1)} label={label('작업 영역')} presets={options.defaultPlacement ? defaultPresets : presets}
      initialPreset="default" initialMode={options.stack ? 'stack' : 'fit'} persistKey="main" persistence={{ key: 'drag', storage }}
      panelAddDrag={options.enabled} toolbarActions={<PanelAddMenu items={catalog} shown={added ? ['trend', 'detail', rowId] : ['trend', 'detail']}
        chartFields={options.chartPicker ? { measures: [], breakdowns: [] } : undefined}
        pinByDefault={false} onAdd={(...args) => { add(...args); setAdded(true); return options.chartPicker ? 'dist' : undefined; }} />} />;
  }
  const view = render(<I18nProvider><Demo /></I18nProvider>);
  const detail = (await screen.findByRole('tab', { name: '상세' })).closest('.dv-groupview')!;
  const bounds = vi.spyOn(detail, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 100, 300, 300));
  // Model the browser's hit at the mocked group bounds. Individual cases can put another element above it.
  const hit = vi.fn<NonNullable<Document['elementFromPoint']>>(() => detail.querySelector('.dv-tabs-and-actions-container'));
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit });
  const user = userEvent.setup();
  if (options.maximize) await user.click(screen.getByRole('button', { name: '상세 최대화' }));
  const trigger = screen.getByRole('button', { name: '패널 추가' });
  trigger.focus();
  await user.keyboard('{Enter}');
  const row = await screen.findByRole(options.chartPicker ? 'button' : 'menuitem', { name: '분포' });
  const saved = () => {
    view.unmount();
    return JSON.parse(storage.setItem.mock.lastCall?.[1] as string) as { layout: unknown };
  };
  return { onAdd, row, user, bounds, saved, hit, unmount: view.unmount,
    replaceAdd: (add: typeof onAdd) => { view.rerender(<I18nProvider><Demo add={add} /></I18nProvider>); } };
}

afterEach(() => { Reflect.deleteProperty(document, 'elementFromPoint'); });

function pointer(type: string, target: EventTarget, clientX = 420, clientY = 150, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, pointerId, button: 0 });
  act(() => { target.dispatchEvent(event); });
}
const start = (row: HTMLElement, y?: number) => {
  pointer('pointerdown', row, 700, 45);
  pointer('pointermove', window, 420, y);
};
const preview = () => document.querySelector<HTMLElement>('[data-panel-add-preview]');

it('drags a filtered category row while its hover preview stays inside the faded picker', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  const category = { id: 'charts', title: label('차트') };
  const catalog = items.map(item => ({ ...item, category }));
  function Demo() {
    const [added, setAdded] = useState(false);
    return <PanelWorkspace panels={added ? panels : panels.slice(0, -1)} label={label('작업 영역')}
      presets={presets} initialPreset="default" initialMode="fit" persistKey="categorized" panelAddDrag
      toolbarActions={<PanelAddMenu items={catalog} shown={added ? ['trend', 'detail', 'dist'] : ['trend', 'detail']}
        onAdd={(id, pin) => { onAdd(id, pin); setAdded(true); }} />} />;
  }
  render(<I18nProvider><Demo /></I18nProvider>);
  const detail = (await screen.findByRole('tab', { name: '상세' })).closest('.dv-groupview')!;
  vi.spyOn(detail, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 100, 300, 300));
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => detail.querySelector('.dv-tabs-and-actions-container') });
  await user.click(screen.getByRole('button', { name: '패널 추가' }));
  const dialog = screen.getByRole('dialog', { name: '패널 추가' });
  const pane = screen.getByRole('complementary');
  const disabled = screen.getByRole('button', { name: '비활성' });
  await user.hover(disabled);
  expect(pane).toHaveTextContent('이 단계에서는 쓸 수 없음');
  start(disabled);
  expect(preview()).toBeNull();
  pointer('pointerup', window);

  await user.type(screen.getByRole('searchbox'), '분포');
  const row = screen.getByRole('button', { name: '분포' });
  await user.hover(row);
  expect(pane).toHaveTextContent('분포');
  pointer('pointerdown', row, 700, 45);
  pointer('pointermove', row);
  expect(preview()).toHaveAttribute('data-panel-add-preview', 'top');
  expect(dialog).toHaveAttribute('data-panel-add-dragging');
  expect(dialog.parentElement).toHaveAttribute('data-radix-popper-content-wrapper');
  expect(dialog).toContainElement(pane);
  pointer('pointerup', window);
  expect(onAdd).toHaveBeenCalledExactlyOnceWith('dist', true);
  expect(await screen.findByRole('tab', { name: '분포' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '패널 추가' })).not.toBeInTheDocument();
});

it('saves the same active source tab when the added panel joins a group as a background tab', async () => {
  const drag = await mount({ enabled: true, defaultPlacement: true });
  start(drag.row);
  pointer('pointerup', window);
  await screen.findByRole('tab', { name: '분포' });
  const dragged = drag.saved();

  const keyboard = await mount({ enabled: true, defaultPlacement: true });
  keyboard.row.focus();
  await keyboard.user.keyboard('{Enter}');
  (await screen.findByRole('tab', { name: '분포' })).focus();
  await keyboard.user.keyboard('{Shift>}{F10}{/Shift}');
  (await screen.findByRole('menuitem', { name: '상세 묶음 위로 옮기기' })).focus();
  await keyboard.user.keyboard('{Enter}');
  const moved = keyboard.saved();
  expect(moved.layout).toMatchObject({ children: [{ panels: ['trend', 'summary'], active: 'summary' }, { dir: 'column' }] });
  expect(dragged).toEqual(moved);
});

it('uses the same current handler and pin choice for a drop as for a click', async () => {
  const latestAdd = vi.fn();
  const drag = await mount({ enabled: true });
  pointer('pointerdown', drag.row, 700, 45);
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '추가하면 고정' }));
  pointer('pointermove', window);
  drag.replaceAdd(latestAdd);
  pointer('pointerup', window);
  expect(drag.onAdd).not.toHaveBeenCalled();
  expect(latestAdd.mock.calls).toEqual([['dist', true]]);
  drag.unmount();

  const click = await mount({ enabled: true });
  await click.user.click(screen.getByRole('menuitemcheckbox', { name: '추가하면 고정' }));
  await click.user.click(click.row);
  expect(latestAdd.mock.calls).toEqual(click.onAdd.mock.calls);
});

it.each(['picker closes', 'workspace unmounts'])('clears a stationary preview when the %s', async ending => {
  const { row, onAdd, unmount } = await mount({ enabled: true, chartPicker: true });
  start(row);
  expect(preview()).not.toBeNull();
  if (ending === 'picker closes') act(() => { screen.getByRole('tab', { name: '상세' }).focus(); });
  else unmount();
  await waitFor(() => { expect(preview()).toBeNull(); });
  pointer('pointerup', window);
  expect(onAdd).not.toHaveBeenCalled();
});

it('guards keyboard selection in the faded picker during drag', async () => {
  const { row, onAdd } = await mount({ enabled: true });
  start(row);
  row.focus();
  fireEvent.keyDown(row, { key: 'Enter' });
  expect(onAdd).not.toHaveBeenCalled();
});

it('suppresses the cancelled click across a different pointerdown', async () => {
  const { row, onAdd } = await mount({ enabled: true });
  start(row);
  fireEvent.keyDown(window, { key: 'Escape' });
  pointer('pointerdown', row, 700, 45, 2);
  pointer('pointerup', row);
  fireEvent.click(row, { detail: 1 });
  pointer('pointerup', window, 700, 45, 2);
  expect(onAdd).not.toHaveBeenCalled();
});

it.each([{ surface: 'overlapping control', stack: false }])(
  'refuses a drop onto a $surface at the same coordinates', async ({ stack }) => {
    const { row, hit, onAdd } = await mount({ enabled: true, stack });
    const dock = screen.getByRole('region', { name: '작업 영역' });
    if (stack) hit.mockReturnValue(dock.querySelector('[data-dock-panel="detail"][data-dock-visible="true"]'));
    const rendered = hit(420, 150);
    hit.mockReturnValue(stack ? null : screen.getByRole('button', { name: '패널 추가' }));
    start(row);
    expect(preview()).toBeNull();
    hit.mockReturnValue(rendered);
    pointer('pointermove', window);
    expect(dock).toContainElement(preview());
    hit.mockReturnValue(stack ? null : screen.getByRole('button', { name: '패널 추가' }));
    pointer('pointerup', window);
    expect(onAdd).not.toHaveBeenCalled();
  },
);

it.each([{ position: 'top', direction: '위로', y: 150, chartPicker: false, stack: false },
  { position: 'bottom', direction: '아래로', y: 350, chartPicker: true, stack: false }])('previews $position and saves the same placement and pin choice as keyboard add and move', async ({ position, direction, y, chartPicker, stack }) => {
  const drag = await mount({ enabled: true, chartPicker, stack });
  start(drag.row);
  if (position === 'bottom') pointer('pointermove', window, 420, y);
  expect(preview()).toHaveAttribute('data-panel-add-preview', position);
  expect(drag.row.closest('[data-panel-add-content]')).toHaveAttribute('data-panel-add-dragging');
  pointer('pointerup', window, 420, y);
  expect(drag.onAdd.mock.calls).toEqual([[chartPicker ? 'distribution' : 'dist', false]]);
  await screen.findByRole('tab', { name: '분포' });
  const dragged = drag.saved();
  const detailGroup = { type: 'group', panels: ['detail'], active: 'detail' };
  const addedGroup = { type: 'group', panels: ['dist'], active: 'dist' };
  expect(dragged.layout).toMatchObject({ dir: 'row', children: [{ panels: ['trend'] }, {
    dir: 'column', children: position === 'top' ? [addedGroup, detailGroup] : [detailGroup, addedGroup],
  }] });

  const keyboard = await mount({ enabled: true, chartPicker, stack });
  keyboard.row.focus();
  await keyboard.user.keyboard('{Enter}');
  const added = await screen.findByRole('tab', { name: '분포' });
  expect(added.closest('.dv-groupview')).not.toContainElement(screen.getByRole('tab', { name: '상세' }));
  await keyboard.user.click(screen.getByRole('button', { name: '분포 동작' }));
  (await screen.findByRole('menuitem', { name: `상세 묶음 ${direction} 옮기기` })).focus();
  await keyboard.user.keyboard('{Enter}');
  expect(keyboard.onAdd.mock.calls).toEqual(drag.onAdd.mock.calls);
  expect(keyboard.saved()).toEqual(dragged);
});

it.each(['추세.*이미 있음', '비활성.*이 단계에서는 쓸 수 없음'])('keeps a disabled row with %s from starting a drag', async reason => {
  const { onAdd } = await mount({ enabled: true });
  const row = screen.getByRole('menuitem', { name: new RegExp(reason) });
  expect(row).toHaveAttribute('aria-disabled', 'true');
  start(row);
  expect(preview()).toBeNull();
  pointer('pointerup', window);
  expect(onAdd).not.toHaveBeenCalled();
});

it.each(['Escape', 'blur', 'pointercancel', 'lostpointercapture'])('clears the preview and suppresses add on %s', async type => {
  const { row, onAdd } = await mount({ enabled: true });
  start(row);
  expect(preview()).not.toBeNull();
  if (type === 'Escape') fireEvent.keyDown(window, { key: type });
  else if (type === 'blur') fireEvent.blur(window);
  else pointer(type, type === 'lostpointercapture' ? row : window);
  expect(preview()).toBeNull();
  if (type !== 'pointercancel') { pointer('pointerup', row); fireEvent.click(row, { detail: 1 }); }
  expect(onAdd).not.toHaveBeenCalled();
});

it('refuses a drop if its previewed group moved before release', async () => {
  const { row, bounds, onAdd } = await mount({ enabled: true });
  start(row);
  bounds.mockReturnValue(new DOMRect(325, 110, 300, 300));
  pointer('pointerup', row);
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText('놓는 위치가 바뀌었습니다. 다시 끌어 놓으세요.')).toHaveAttribute('role', 'status');
});

it('dims an unavailable group and announces its reason on release', async () => {
  const { row, onAdd } = await mount({ enabled: true, maximize: true });
  start(row);
  const reason = '원래 크기로 돌아가면 패널을 놓을 수 있습니다.';
  expect(screen.getByText(reason).closest('[data-panel-add-refused]')).not.toBeNull();
  expect(preview()).toBeNull();
  pointer('pointerup', window);
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByText(reason)).toHaveAttribute('role', 'status');
});

it('does not start a drag in stack mode and keeps the click add', async () => {
  const { row, onAdd, user } = await mount({ enabled: true, stack: true });
  start(row);
  expect(preview()).toBeNull();
  expect(document.querySelector('[data-panel-add-dragging]')).toBeNull();
  pointer('pointerup', window);
  expect(onAdd).not.toHaveBeenCalled();
  await user.click(row);
  expect(onAdd.mock.calls).toEqual([['dist', false]]);
});

it('keeps pointer movement and click unchanged without opt-in', async () => {
  const { row, onAdd, user } = await mount({ enabled: false });
  start(row);
  expect(preview()).toBeNull();
  pointer('pointerup', window);
  expect(onAdd).not.toHaveBeenCalled();
  await user.click(row);
  expect(onAdd.mock.calls).toEqual([['dist', false]]);
});
