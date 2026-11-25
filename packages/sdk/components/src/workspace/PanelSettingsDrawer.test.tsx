import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { MenuViewPanels, PanelInstanceInput } from '@ap/contracts';
import { I18nProvider } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer, PanelSettingsDrawer } from '../index';

const link = { key: 'selection', from: 'source.selection', mode: 'follow' } as const;
const output = { key: 'selection', dimension: 'equipment', shape: 'set' } as const;
const active = { shape: 'set', values: ['EQ-1'] } as const;
const useFilter = { key: 'selection', selection: 'filter' } as const;

function Host() {
  const { ref } = useDetailPanelSlotHost();
  return <aside ref={ref} />;
}
function setup(input?: PanelInstanceInput, { cycle = false } = {}) {
  const panel = { id: 'target', source: { kind: 'declared', panel: 'target' } as const, inputs: input ? [input] : [], outputs: [output] };
  const value: MenuViewPanels = { version: 1, instances: [
    panel, { id: 'source', source: { kind: 'declared', panel: 'source' }, inputs: cycle ? [{ ...link, from: 'target.selection' }] : [], outputs: [output] },
  ] };
  const onChange = vi.fn();
  render(<I18nProvider><DetailPanelSlotProvider><Host /><PanelSettingsDrawer panel={panel} title={{ ko: '대상', en: 'Target' }}
    value={value} declaredInputs={[useFilter]} sourceReference={() => link.from}
    selectionOf={() => active} onChange={onChange} onClose={vi.fn()} /></DetailPanelSlotProvider></I18nProvider>);
  return onChange;
}
const radio = (name: string, options?: { checked: boolean }) => screen.getByRole('radio', { name, ...options });
afterEach(cleanup);

it.each([
  [undefined, '무시'], [link, '거르기'], [{ ...link, use: 'highlight' } as const, '강조만'],
])('shows the receiving mode for %j', (input, label) => {
  setup(input);
  expect(radio(label, { checked: true })).toBeTruthy();
});

it('writes the chosen mode, omits ignored inputs, and keeps the exact held selection', async () => {
  const held = { ...link, mode: 'hold', value: active } as const;
  const update = setup(held);
  expect(screen.getByText('EQ-1')).toBeTruthy();
  const mode = screen.getByRole('radiogroup', { name: '받는 방식' });
  await userEvent.click(within(mode).getByRole('radio', { name: '강조만' }));
  expect(update.mock.lastCall?.[0].instances[0].inputs).toEqual([{ ...held, use: 'highlight' }]);
  await userEvent.click(radio('무시'));
  expect(update.mock.lastCall?.[0].instances[0].inputs).toEqual([]);
});

it('refuses a filter cycle and accepts a cycle with a highlight edge', async () => {
  const update = setup(undefined, { cycle: true });
  await userEvent.click(radio('거르기'));
  expect(screen.getByRole('alert').textContent).toContain('거르기 연결이 순환합니다');
  expect(update).not.toHaveBeenCalled();
  await userEvent.click(radio('강조만'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(update.mock.lastCall?.[0].instances[0].inputs).toEqual([{ ...link, use: 'highlight' }]);
});

it('reaches both segments by keyboard and captures the current selection on hold', async () => {
  const update = setup(link);
  radio('거르기').focus();
  fireEvent.keyDown(radio('거르기'), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(radio('강조만'));
  await userEvent.tab();
  expect(document.activeElement).toBe(radio('따라가기'));
  fireEvent.keyDown(radio('따라가기'), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(radio('붙잡기'));
  expect(update.mock.lastCall?.[0].instances[0].inputs).toEqual([{ ...link, mode: 'hold', value: active }]);
});

it('shows the saved range endpoints even when the source has no live value', () => {
  const held = { shape: 'range', from: '2026-09-20T00:00:00', to: '2026-09-22T00:00:00' } as const;
  const panel = { id: 'target', source: { kind: 'declared', panel: 'target' } as const, outputs: [],
    inputs: [{ ...link, mode: 'hold', value: held } as const] };
  const source = { id: 'source', source: { kind: 'declared', panel: 'source' } as const, inputs: [], outputs: [{ ...output, shape: 'range' as const }] };
  render(<I18nProvider><DetailPanelSlotProvider><Host /><PanelSettingsDrawer panel={panel} title={{ ko: '대상', en: 'Target' }}
    value={{ version: 1, instances: [panel, source] }} selectionOf={() => null} onChange={vi.fn()} onClose={vi.fn()} /></DetailPanelSlotProvider></I18nProvider>);
  expect(screen.getByText('2026-09-20T00:00:00 – 2026-09-22T00:00:00')).toBeTruthy();
});

it('closes the settings drawer when row detail takes the same slot', () => {
  const panel = { id: 'target', source: { kind: 'declared', panel: 'target' } as const, inputs: [], outputs: [] };
  const close = vi.fn();
  const stage = ({ row }: { row: boolean }) => <I18nProvider><DetailPanelSlotProvider><Host />
    <PanelSettingsDrawer panel={panel} title={{ ko: '대상', en: 'Target' }} value={{ version: 1, instances: [panel] }}
      selectionOf={() => null} onChange={vi.fn()} onClose={close} />
    {row && <DetailDrawer title="Row detail" onClose={vi.fn()} tabs={[]} />}
  </DetailPanelSlotProvider></I18nProvider>;
  const view = render(stage({ row: false }));
  view.rerender(stage({ row: true }));
  expect(screen.getByRole('dialog', { name: 'Row detail' })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: '대상' })).toBeNull();
  expect(close).toHaveBeenCalledOnce();
});

it.each([undefined, { ...link, from: 'other.selection' } as const])('uses the declared eligible source for new connections and keeps the saved source (%j)', async input => {
  const panel = { id: 'target', source: { kind: 'declared', panel: 'target' } as const, inputs: input ? [input] : [], outputs: [] };
  const publishers = ['other', 'source'].map(id => ({ id, source: { kind: 'declared', panel: id } as const, inputs: [], outputs: [output] }));
  const onChange = vi.fn();
  render(<I18nProvider><DetailPanelSlotProvider><Host /><PanelSettingsDrawer panel={panel} title={{ ko: '대상', en: 'Target' }}
    value={{ version: 1, instances: [panel, ...publishers] }} declaredInputs={[useFilter]} sourceReference={() => link.from}
    selectionOf={() => active} onChange={onChange} onClose={vi.fn()} /></DetailPanelSlotProvider></I18nProvider>);
  await userEvent.click(radio('강조만'));
  expect(onChange.mock.lastCall?.[0].instances[0].inputs).toEqual([{ ...link, from: input?.from ?? link.from, use: 'highlight' }]);
});
