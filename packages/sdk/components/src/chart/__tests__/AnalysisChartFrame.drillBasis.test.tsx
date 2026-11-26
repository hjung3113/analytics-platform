import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useDrill } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import { DrillLayout } from '../../archetypes/DrillLayout';
import { DockChartHeadProvider, DockChartPaneId, useDockChartSlot } from '../../dock/DockChartHead';
import { NextAnalysisBridge } from '../NextAnalysisBridge';
import { QueryPanelContentContext } from '../../workspace/panelContext';
import type { ComponentProps, ReactNode } from 'react';
import type { EChartProps } from '../EChart';
vi.mock('../EChartImpl', () => ({ default: Plot }));
let plotEvents: EChartProps['onEvents'];
let readyPlot: HTMLDivElement | undefined;
let zoomStart = 0;
function Plot({ onEvents, onReady, option }: EChartProps) {
  return <div role="img" ref={node => {
    if (!node) return;
    plotEvents = onEvents;
    zoomStart = (option.dataZoom as { start: number }[] | undefined)?.[0]?.start ?? 0;
    if (readyPlot === node) return;
    readyPlot = node;
    onReady?.({
      dispatchAction: () => {},
      getWidth: () => 600,
      getDom: () => node,
      getModel: () => ({
        getSeries: () => [{
          id: 'duration', subType: 'bar', getData: () => ({
            indexOfRawIndex: (index: number) => zoomStart && index === 0 ? -1 : index,
            getItemLayout: (index: number) => index < 0 ? undefined : ({ x: 48 + zoomStart, y: 72 + 24 * index, width: 120, height: 16 }),
          }),
        }],
      }),
    } as unknown as Parameters<NonNullable<EChartProps['onReady']>>[0]);
  }} />;
}
function DrillScreen({ children }: { children: ReactNode }) {
  const { depth } = useDrill();
  return <NextAnalysisBridge><DrillLayout>{depth === 0 ? children : null}</DrillLayout></NextAnalysisBridge>;
}
const keys = ['motion', 'motionBasis'];
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
type FrameProps = ComponentProps<typeof AnalysisChartFrame>;
function DockedChart({ children }: { children: ReactNode }) {
  const { ref } = useDockChartSlot('current', 'toolbar');
  return <><div data-testid="dock-toolbar" ref={ref} /><DockChartPaneId.Provider value="current">{children}</DockChartPaneId.Provider></>;
}
function mount({ withBases = true, rowPitch, vertical, layout = false, withReset = false, outer = false, docked = false, frameProps }: {
  withBases?: boolean; rowPitch?: number; vertical?: boolean; layout?: boolean; withReset?: boolean; outer?: boolean; docked?: boolean; frameProps?: Partial<FrameProps>;
} = {}) {
  const group = groupId('overview');
  const registry = createRegistry({
    spaces: [testSpace()],
    groups: [{ id: group, label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [{
      id: 'home', group, primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' },
      path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis',
      query: { mode: 'live' }, features: { export: false, savedView: false, annotate: false, compare: false },
      pageKeys: withReset ? [...keys, 'row'] : keys, contextResetKeys: keys,
      drill: { levels: [{
        key: 'motion', label: { ko: 'Motion', en: 'Motion' },
        ...(withBases && { basisKey: 'motionBasis', bases: [
          { id: 'recipe', label: 'Recipe' }, { id: 'restricted', label: 'Restricted' },
        ] }),
      }], resetKeys: withReset ? ['row'] : undefined, isBasisAvailable: (_key, id, _context, _can, page) => {
        if (!withReset) return id !== 'restricted';
        if (id === 'restricted') return page.some(([key]) => key === 'row');
        return page.some(([key, value]) => key === 'motionBasis' && value === id);
      } },
    }],
  });
  const onActivate = vi.fn();
  window.history.replaceState(null, '', withReset ? '/?v=1&row=r1' : '/?v=1');
  const page = (overrides?: Partial<FrameProps>, result: 'current' | 'prior' = 'current') => {
    const frame = <AnalysisChartFrame chartId="basis" title="Motion" xType="category" orientation={vertical ? "vertical" : "horizontal"} rowPitch={rowPitch} unit="s"
      series={[{ id: 'duration', name: 'Duration', unit: 's', color: 'chart-blue', kind: vertical ? 'bar' : undefined, points: [['Pump', 3], ['Vent', 5]] }]}
      nextAnalysis pointActivation={{ on: 'dblclick', onActivate }} nextAnalysisPointDrill={{ level: 'motion', value: point => point.x }} {...frameProps} {...overrides} />;
    const chart = docked ? <DockChartHeadProvider><DockedChart>{frame}</DockedChart></DockChartHeadProvider> : frame;
    const content = layout ? <DrillScreen>{chart}</DrillScreen> : chart;
    return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <QueryPanelContentContext.Provider value={result}>
        {outer ? <div data-testid="outer-scrollport">{content}</div> : content}
      </QueryPanelContentContext.Provider>
    </PlatformProvider></I18nProvider>;
  };
  const { rerender } = render(page());
  return {
    onActivate,
    updateFrame: (overrides: Partial<FrameProps>) => rerender(page(overrides)),
    updateResult: (result: 'current' | 'prior') => rerender(page(undefined, result)),
  };
}
const chart = () => screen.getByRole('group', { name: '차트 지점' });
const activate = (dataIndex: number) => act(() => {
  plotEvents?.dblclick?.({ seriesId: 'duration', dataIndex }, {} as never);
});
afterEach(() => { cleanup(); plotEvents = undefined; readyPlot = undefined; vi.restoreAllMocks(); });

it('opens under the activated bar, checks the default and excludes unavailable bases', async () => {
  const { onActivate } = mount();
  await screen.findByRole('img');
  activate(1);
  expect(screen.getByRole('menuitemradio', { name: 'Motion' })).toBeChecked();
  expect(screen.queryByRole('menuitemradio', { name: 'Restricted' })).toBeNull();
  expect(chart().querySelector('[aria-haspopup="menu"]')).toHaveStyle('--basis-left: 48px; --basis-top: 96px; --basis-height: 16px; --basis-width: 120px');
  expect(onActivate).not.toHaveBeenCalled();
});
it('enters the selected basis with one history push', async () => {
  mount();
  await screen.findByRole('img');
  activate(1);
  const push = vi.spyOn(window.history, 'pushState');
  await userEvent.keyboard('{End}{Enter}');
  expect(window.location.search).toBe('?v=1&motion=Vent&motionBasis=recipe');
  expect(push).toHaveBeenCalledTimes(1);
});

it('closes the basis list when its chart becomes a prior result and blocks activation until current', async () => {
  const { onActivate, updateResult } = mount();
  await screen.findByRole('img');
  activate(1);
  expect(screen.getByRole('menuitemradio', { name: 'Recipe' })).toBeInTheDocument();

  updateResult('prior');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(screen.queryByRole('button', { name: '선택 지점 실행' })).toBeNull();
  activate(1);
  expect(screen.queryByRole('menu')).toBeNull();
  expect(onActivate).not.toHaveBeenCalled();
  expect(window.location.search).toBe('?v=1');

  updateResult('current');
  expect(screen.queryByRole('menu')).toBeNull();
  activate(1);
  expect(screen.getByRole('menuitemradio', { name: 'Recipe' })).toBeInTheDocument();
});
it.each(['Enter', 'toolbar'])('supports keyboard choice and Escape focus return from %s', async source => {
  mount();
  await screen.findByRole('img');
  if (source === 'Enter') {
    act(() => chart().focus());
    await userEvent.keyboard('{Enter}');
  } else fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
  const recipe = screen.getByRole('menuitemradio', { name: 'Recipe' });
  await userEvent.keyboard('{End}');
  expect(recipe).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(chart()).toHaveFocus());
  expect(screen.queryByRole('menu')).toBeNull();
  expect(window.location.search).toBe('?v=1');
});

it('opens the basis list from the docked chart tools and returns focus to the plot on Escape', async () => {
  mount({ docked: true, frameProps: { chrome: 'standard' } });
  await screen.findByRole('img');
  const more = screen.getByRole('button', { name: '더보기' });
  expect(screen.getByTestId('dock-toolbar')).toContainElement(more);
  await userEvent.click(more);
  await userEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
  const recipe = await screen.findByRole('menuitemradio', { name: 'Recipe' });
  await userEvent.keyboard('{End}');
  expect(recipe).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(chart()).toHaveFocus());
  expect(screen.queryByRole('menu')).toBeNull();
  expect(window.location.search).toBe('?v=1');
});

it('also offers available bases from the next-analysis drill action', async () => {
  mount();
  await screen.findByRole('img');
  act(() => plotEvents?.click?.({ seriesId: 'duration', dataIndex: 1 }, {} as never));
  fireEvent.keyDown(screen.getByRole('button', { name: '나누기' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Recipe' }));
  expect(window.location.search).toBe('?v=1&motion=Vent&motionBasis=recipe');
});
it('calls normal point activation for a next level without bases', async () => {
  const { onActivate } = mount({ withBases: false });
  await screen.findByRole('img');
  activate(1);
  expect(onActivate).toHaveBeenCalledWith({ x: 'Vent', seriesId: 'duration', value: 5 });
  expect(screen.queryByRole('menu')).toBeNull();
});

it('reveals a lower row for toolbar activation and dismisses the list when it scrolls away', async () => {
  mount({ rowPitch: 24 });
  await screen.findByRole('img');
  Object.defineProperty(chart(), 'clientHeight', { value: 80 });
  act(() => plotEvents?.click?.({ seriesId: 'duration', dataIndex: 1 }, {} as never));
  fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
  expect(chart().scrollTop).toBeGreaterThan(0);
  expect(await screen.findByRole('menu')).toBeTruthy();
  chart().scrollTop = 0;
  fireEvent.scroll(chart());
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
});

it('reveals a filtered vertical bar and follows later zoom changes', async () => {
  mount({ vertical: true });
  await screen.findByRole('img');
  const zoom = screen.getByRole('button', { name: '확대' });
  fireEvent.click(zoom);
  fireEvent.keyDown(chart(), { key: 'Enter' });
  expect(await screen.findByRole('menu')).toBeTruthy();
  expect(chart().querySelector('[aria-haspopup="menu"]')).toHaveStyle('--basis-left: 48px');
  fireEvent.click(zoom);
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  activate(1);
  expect(await screen.findByRole('menu')).toBeTruthy();
  fireEvent.click(zoom);
  await waitFor(() => expect(chart().querySelector('[aria-haspopup="menu"]')).toHaveStyle('--basis-left: 85.5px'));
});

it('remembers the applied choice for that Motion after going up', async () => {
  mount({ layout: true });
  await screen.findByRole('img');
  activate(0);
  await userEvent.keyboard('{End}{Enter}');
  fireEvent.click(screen.getByRole('button', { name: '전체' }));
  await screen.findByRole('img');
  activate(0);
  expect(screen.getByRole('menuitemradio', { name: 'Recipe' })).toBeChecked();
  expect(window.location.search).toBe('?v=1');
  await userEvent.keyboard('{Escape}');
  activate(1);
  expect(screen.getByRole('menuitemradio', { name: 'Motion' })).toBeChecked();
});

it.each(['bar', 'row'])('offers a basis that survives Kernel validation after drill resets from the %s', async source => {
  mount({ withReset: true });
  await screen.findByRole('img');
  const role = source === 'bar' ? 'menuitemradio' : 'menuitem';
  if (source === 'bar') activate(1);
  else {
    act(() => plotEvents?.click?.({ seriesId: 'duration', dataIndex: 1 }, {} as never));
    fireEvent.keyDown(screen.getByRole('button', { name: '나누기' }), { key: 'Enter' });
  }
  expect(screen.queryByRole(role, { name: 'Restricted' })).toBeNull();
  fireEvent.click(screen.getByRole(role, { name: 'Recipe' }));
  expect(window.location.search).toBe('?v=1&motion=Vent&motionBasis=recipe');
});

it.each(['Enter', 'toolbar'])('reveals a bar through an enclosing scrollport from %s', async source => {
  mount({ outer: true });
  const plot = await screen.findByRole('img');
  const outer = screen.getByTestId('outer-scrollport');
  outer.style.overflowY = 'auto';
  Object.defineProperty(outer, 'clientHeight', { value: 100 });
  const belowFold = () => new DOMRect(0, 160 - outer.scrollTop, 600, 160);
  vi.spyOn(plot, 'getBoundingClientRect').mockImplementation(belowFold);
  vi.spyOn(chart(), 'getBoundingClientRect').mockImplementation(belowFold);
  if (source === 'Enter') fireEvent.keyDown(chart(), { key: 'Enter' });
  else fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
  expect(outer.scrollTop).toBe(148);
  expect(await screen.findByRole('menuitemradio', { name: 'Recipe' })).toBeTruthy();
});

it.each([{ kind: 'line', value: 3 }, { kind: 'bar', value: null }] as const)(
  'uses ordinary activation for a $kind point with value $value',
  async ({ kind, value }) => {
    const { onActivate } = mount({ vertical: true, frameProps: {
      series: [{ id: 'duration', name: 'Duration', color: 'chart-blue', kind, points: [['Pump', value]] }],
    } });
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
    expect(onActivate).toHaveBeenCalledWith({ x: 'Pump', seriesId: 'duration', value });
    expect(screen.queryByRole('menu')).toBeNull();
  },
);

it.each(['ineligible', 'new target'] as const)('dismisses a visible pending bar after a same-URL change to %s', async change => {
  const { updateFrame } = mount();
  await screen.findByRole('img');
  activate(1);
  expect(screen.getByRole('menuitemradio', { name: 'Recipe' })).toBeTruthy();
  updateFrame(change === 'ineligible' ? { isPointSelectable: point => point.x !== 'Vent' } : {
    nextAnalysisPointDrill: { level: 'motion', value: point => point.x.toLowerCase() },
  });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(screen.getByRole('img')).toBeTruthy();
  expect(window.location.search).toBe('?v=1');
});
