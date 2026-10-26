import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartPoint, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { installResizeObserver } from '../../dock/__tests__/harness';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));

let plotProps: EChartProps | null = null;
/** Stand-in plot: one button per category plays a click on that row. */
function FakePlot(props: EChartProps) {
  plotProps = props;
  const categories = (props.option as unknown as { yAxis: { data?: string[] } }).yAxis.data ?? [];
  return <div role="img" aria-label={props.ariaLabel}>
    {categories.map((c, dataIndex) => <button key={c} type="button" onClick={() => props.onEvents?.click?.({ seriesId: 'a', dataIndex, name: c }, {} as never)}>bar-{c}</button>)}
  </div>;
}

const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const rows: ChartSeries[] = [
  { id: 'a', name: 'A', color: 'chart-blue', points: [['R1', 3], ['R2', 5], ['AUX', null]] },
  { id: 'b', name: 'B', color: 'chart-teal', points: [['R1', 1], ['R2', 2], ['AUX', null]] },
];
function mount(props: Partial<AnalysisChartFrameProps> = {}) {
  window.history.replaceState(null, '', '/?v=1');
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisChartFrame chartId="pa" title="Rows" series={rows} xType="category" orientation="horizontal" stacked unit="s" {...props} />
  </PlatformProvider></I18nProvider>);
}
const picker = () => screen.getByRole('combobox', { name: '차트 지점 선택' });
const openMenu = () => act(() => { screen.getByRole('button', { name: '지점 동작' }).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
const choose = (x: string) => fireEvent.change(picker(), { target: { value: JSON.stringify(['a', x]) } });

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { plotProps = null; warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('point-dependent pointActions (#690n)', () => {
  const actions = (point: ChartPoint) => point.x === 'R1' ? [{ id: 'add', label: 'Add', onSelect: vi.fn() }] : point.x === 'R2' ? [{ id: 'remove', label: 'Remove', onSelect: vi.fn() }] : [];

  it('offers the list of the selected point and none of the other point\'s actions', async () => {
    mount({ pointActions: actions });
    await screen.findByRole('img');
    choose('R1'); openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Add' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Remove' })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    choose('R2'); openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Remove' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Add' })).toBeNull();
  });

  it('passes the selected point to the function and the action', async () => {
    const onSelect = vi.fn();
    const pointActions = vi.fn((point: ChartPoint) => [{ id: 'go', label: `Go ${point.x}`, onSelect }]);
    mount({ pointActions });
    await screen.findByRole('img');
    choose('R2'); openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Go R2' }));
    expect(pointActions).toHaveBeenCalledWith(expect.objectContaining({ x: 'R2', seriesId: 'a' }));
    expect(onSelect).toHaveBeenCalledWith({ x: 'R2', seriesId: 'a', value: 5 });
  });

  it('disables the trigger while the list for the selected point is empty', async () => {
    mount({ pointActions: actions });
    await screen.findByRole('img');
    choose('R1');
    expect((screen.getByRole('button', { name: '지점 동작' }) as HTMLButtonElement).disabled).toBe(false);
    choose('AUX');
    expect((screen.getByRole('button', { name: '지점 동작' }) as HTMLButtonElement).disabled).toBe(true);
    openMenu();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('legend={false} (#690n)', () => {
  it('draws the legend and its checkboxes by default', async () => {
    mount();
    expect(await screen.findByRole('group', { name: '범례' })).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('omits the legend and warns when nothing else owns visibility', async () => {
    mount({ legend: false });
    await screen.findByRole('img');
    expect(screen.queryByRole('group', { name: '범례' })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('legend={false} without visibleSeriesIds'));
  });

  it('stays silent with visibleSeriesIds and keeps the table and plot', async () => {
    mount({ legend: false, visibleSeriesIds: ['a'] });
    await screen.findByRole('img');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(plotProps!.ariaLabel).toContain('A');
    expect(plotProps!.ariaLabel).not.toContain('B');
  });
});

describe('fillMin (#690n)', () => {
  const plotBox = (container: HTMLElement) => container.querySelector<HTMLElement>('.grow')!;

  it('keeps the 320 px floor and its class by default', async () => {
    const { container } = mount({ size: 'fill' });
    await screen.findByRole('img');
    expect(plotProps!.height).toBe(320);
    expect(plotBox(container).className).toContain('min-h-80');
    expect(plotBox(container).style.minHeight).toBe('');
  });

  it('honours a lower floor for the plot height and the box', async () => {
    const { container } = mount({ size: 'fill', fillMin: 200 });
    await screen.findByRole('img');
    expect(plotProps!.height).toBe(200);
    expect(plotBox(container).className).not.toContain('min-h-80');
    expect(plotBox(container).style.minHeight).toBe('200px');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('clamps to 160 px and warns', async () => {
    const { container } = mount({ size: 'fill', fillMin: 100 });
    await screen.findByRole('img');
    expect(plotProps!.height).toBe(160);
    expect(plotBox(container).style.minHeight).toBe('160px');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('fillMin 100 is below 160px'));
  });

  // The measured box is the plot's own (it grows into what the legend, toolbar and selection summary leave), so the plot height is
  // container − chrome by construction; a taller legend only shows up as a smaller measurement, and the floor clamps it.
  describe('measured plot box', () => {
    let observer: ReturnType<typeof installResizeObserver>;
    beforeAll(() => { observer = installResizeObserver(); });
    afterAll(() => { observer.restore(); });
    it.each<[string, number, number, number]>([
      ['one-line legend leaves 240 px', 240, 200, 240],
      ['two-line legend leaves 190 px', 190, 200, 200],
      ['a short card leaves 110 px', 110, 160, 160],
      ['room above the floor is used', 412, 200, 412],
    ])('%s', async (_name, measured, fillMin, expected) => {
      observer.resize(900, measured);
      const { container } = mount({ size: 'fill', fillMin });
      await screen.findByRole('img');
      await waitFor(() => { expect(plotProps!.height).toBe(expected); });
      expect(plotBox(container).style.minHeight).toBe(`${fillMin}px`);
    });
  });

  it('works with rowPitch', async () => {
    const { container } = mount({ size: 'fill', fillMin: 180, rowPitch: 26 });
    await screen.findByRole('img');
    expect(plotBox(container).style.minHeight).toBe('180px');
    expect(plotBox(container).className).toContain('overflow-y-auto');
  });
});

describe('isPointSelectable (#690n)', () => {
  const selectable = (point: ChartPoint) => point.x !== 'AUX';

  it('leaves skipped points out of the selector', async () => {
    mount({ pointActivation: { on: 'click', onActivate: vi.fn() }, isPointSelectable: selectable });
    await screen.findByRole('img');
    const labels = within(picker()).getAllByRole('option').map(option => option.textContent);
    expect(labels.some(label => label?.startsWith('AUX'))).toBe(false);
    expect(labels).toHaveLength(4);
  });

  it('ignores a click on a skipped row and activates a selectable one', async () => {
    const onActivate = vi.fn(); const onActiveCategoryChange = vi.fn();
    mount({ pointActivation: { on: 'click', onActivate }, isPointSelectable: selectable, onActiveCategoryChange });
    fireEvent.click(await screen.findByRole('button', { name: 'bar-AUX' }));
    expect(onActivate).not.toHaveBeenCalled();
    expect(onActiveCategoryChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'bar-R2' }));
    expect(onActivate).toHaveBeenCalledWith({ x: 'R2', seriesId: 'a', value: 5 });
  });

  it('never offers the Activate button a skipped point', async () => {
    const onActivate = vi.fn();
    mount({ pointActivation: { on: 'click', onActivate }, isPointSelectable: point => point.x === 'R2' });
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '선택 지점 실행' }));
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ x: 'R2' }));
  });
});

describe('without the new props (#690n)', () => {
  it('a static list still opens on any point, legend and floor are unchanged', async () => {
    const { container } = mount({ size: 'fill', pointActions: [{ id: 'inspect', label: 'Inspect', onSelect: vi.fn() }] });
    await screen.findByRole('img');
    expect(screen.getByRole('group', { name: '범례' })).toBeTruthy();
    expect(within(picker()).getAllByRole('option')).toHaveLength(6);
    choose('AUX'); openMenu();
    expect(await screen.findByRole('menuitem', { name: 'Inspect' })).toBeTruthy();
    expect(container.querySelector('.grow')!.className).toContain('min-h-80');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
