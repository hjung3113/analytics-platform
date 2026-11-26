import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

async function mount(options: { enabled: boolean; chartPicker?: boolean; stack?: boolean; maximize?: boolean }) {
  const onAdd = vi.fn();
  const storage = { getItem: () => null, setItem: vi.fn() };
  const rowId = options.chartPicker ? 'distribution' : 'dist';
  const catalog = items.map(item => item.id === 'dist' ? { ...item, id: rowId } : item);
  function Demo() {
    const [added, setAdded] = useState(false);
    return <PanelWorkspace panels={added ? panels : panels.slice(0, 2)} label={label('작업 영역')} presets={presets}
      initialPreset="default" initialMode={options.stack ? 'stack' : 'fit'} persistKey="main" persistence={{ key: 'drag', storage }}
      panelAddDrag={options.enabled} toolbarActions={<PanelAddMenu items={catalog} shown={added ? ['trend', 'detail', rowId] : ['trend', 'detail']}
        chartFields={options.chartPicker ? { measures: [], breakdowns: [] } : undefined}
        pinByDefault={false} onAdd={(...args) => { onAdd(...args); setAdded(true); return options.chartPicker ? 'dist' : undefined; }} />} />;
  }
  const view = render(<I18nProvider><Demo /></I18nProvider>);
  const detail = (await screen.findByRole('tab', { name: '상세' })).closest('.dv-groupview')!;
  const bounds = vi.spyOn(detail, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 100, 300, 300));
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
  return { onAdd, row, user, bounds, saved };
}

function pointer(type: string, target: EventTarget, clientX = 420, clientY = 150) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, pointerId: 1, button: 0 });
  act(() => { target.dispatchEvent(event); });
}
const start = (row: HTMLElement, y?: number) => {
  pointer('pointerdown', row, 700, 45);
  pointer('pointermove', window, 420, y);
};
const preview = () => document.querySelector('[data-panel-add-preview]');

it.each([{ position: 'top', direction: '위로', y: 150, chartPicker: false, stack: false },
  { position: 'bottom', direction: '아래로', y: 350, chartPicker: true, stack: true }])('previews $position and saves the same placement and pin choice as keyboard add and move', async ({ position, direction, y, chartPicker, stack }) => {
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

it('keeps pointer movement and click unchanged without opt-in', async () => {
  const { row, onAdd, user } = await mount({ enabled: false });
  start(row);
  expect(preview()).toBeNull();
  pointer('pointerup', window);
  expect(onAdd).not.toHaveBeenCalled();
  await user.click(row);
  expect(onAdd.mock.calls).toEqual([['dist', false]]);
});
