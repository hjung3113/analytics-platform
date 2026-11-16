import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChart, type DonutSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';
import { downloadChartCsv } from '../analysisChartCsv';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const donut: DonutSpec = { kind: 'donut', slices: [{ id: 'a', label: 'Alpha', value: 30 }, { id: 'b', label: 'Beta', value: 70 }] };
function mount(spec: DonutSpec) {
  const wrap = (next: DonutSpec) => <I18nProvider><AnalysisChart chartId="donut" title="Donut" unit="ea" spec={next} exportActions={{ exportAllowed: true }} /></I18nProvider>;
  const view = render(wrap(spec));
  return { ...view, update: (next: DonutSpec) => view.rerender(wrap(next)) };
}
const select = (dataIndex: number) => act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex }, {} as never));
const summary = () => screen.getByRole('region', { name: '선택 요약' });

it('default donut keeps rendering, events, local selection and CSV unchanged', async () => {
  const onSliceClick = vi.fn();
  const view = mount({ ...donut, onSliceClick });
  await screen.findByRole('img');
  select(1);
  expect(summary()).toHaveTextContent('Beta · 1개 선택');
  expect(onSliceClick).not.toHaveBeenCalled();
  fireEvent.click(within(summary()).getByRole('button', { name: '상세' }));
  expect(onSliceClick).toHaveBeenCalledExactlyOnceWith('b');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  expect({ html: view.container.innerHTML.replace(/_r_[^_]+_/g, '_id_'), option: JSON.parse(JSON.stringify(plot.option)), events: Object.keys(plot.onEvents ?? {}), csv: vi.mocked(downloadChartCsv).mock.calls[0].slice(1) }).toMatchSnapshot();
});

it('follows selectedId, allows a local override until it changes, and keeps Details explicit', async () => {
  const onSelectedChange = vi.fn(); const onSliceClick = vi.fn();
  const spec: DonutSpec = { ...donut, selectedId: 'a', onSelectedChange, onSliceClick };
  const view = mount(spec); await screen.findByRole('img');
  expect(summary()).toHaveTextContent('Alpha · 1개 선택');
  const series = () => (plot.option.series as { data: { itemStyle: { borderWidth: number } }[] }[])[0];
  expect(series().data.map(d => d.itemStyle.borderWidth)).toEqual([1.5, 0]);
  const centre = view.container.querySelector('.pointer-events-none')!;
  expect(centre).toHaveTextContent('Alpha30 ea30%');
  select(1);
  expect(onSelectedChange).toHaveBeenCalledExactlyOnceWith('b');
  expect(onSliceClick).not.toHaveBeenCalled();
  expect(centre).toHaveTextContent('Beta70 ea70%');
  view.update({ ...spec });
  expect(summary()).toHaveTextContent('Beta · 1개 선택');
  view.update({ ...spec, selectedId: 'b' });
  select(0);
  expect(summary()).toHaveTextContent('Alpha · 1개 선택');
  view.update(spec);
  expect(summary()).toHaveTextContent('Alpha · 1개 선택');
  expect(series().data.map(d => d.itemStyle.borderWidth)).toEqual([1.5, 0]);
  fireEvent.click(within(summary()).getByRole('button', { name: '상세' }));
  expect(onSliceClick).toHaveBeenCalledExactlyOnceWith('a');
  expect(onSelectedChange).toHaveBeenCalledTimes(2);
});

it.each([null, 'missing'])('follows %s as no selection and follows a known id when it arrives', async selectedId => {
  const view = mount({ ...donut, selectedId }); await screen.findByRole('img');
  expect(summary()).toHaveTextContent('선택 없음');
  expect(view.container.querySelector('.pointer-events-none')).toHaveTextContent('합계100 ea');
  view.update({ ...donut, slices: [], selectedId: 'a' });
  view.update({ ...donut, selectedId: 'a' });
  expect(summary()).toHaveTextContent('Alpha · 1개 선택');
});

it('reports keyboard selection, deselection and Reset without firing the action', async () => {
  const onSelectedChange = vi.fn(); const onSliceClick = vi.fn();
  const spec: DonutSpec = { ...donut, selectedId: 'a', onSelectedChange, onSliceClick };
  const view = mount(spec); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const beta = screen.getByRole('checkbox', { name: '선택 Beta' });
  fireEvent.click(beta); expect(beta).toBeChecked();
  fireEvent.click(beta); expect(beta).not.toBeChecked();
  view.update({ ...spec }); expect(summary()).toHaveTextContent('선택 없음');
  view.update({ ...spec, selectedId: 'b' }); expect(beta).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '차트 초기화' }));
  expect(onSelectedChange.mock.calls).toEqual([['b'], [null], [null]]);
  expect(onSliceClick).not.toHaveBeenCalled();
});
