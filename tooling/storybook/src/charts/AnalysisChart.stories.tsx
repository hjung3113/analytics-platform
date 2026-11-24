import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnalysisChart } from '@ap/components';
import { ALARM_CODES, CYCLE_STATS, CYCLE_VALUES, DAYS, DOWNTIME, EQUIPMENT, HEAT_CELLS, PROCESSES, SCATTER } from '../equipment';
import { guidedPage } from '../guidance';
import { platformDecorator } from '../platform';

/** 종류별 차트(`spec.kind`): 히트맵·도넛·산점도·상자 그림·파레토·순위 막대·히스토그램. 선택은 차트 안 상태이고 표로 보기가 같은 데이터를 보인다(ADR-0058). */
const meta = {
  title: '데이터 시각화/AnalysisChart',
  component: AnalysisChart,
  decorators: [platformDecorator({ features: { export: true } })],
  parameters: { docs: { page: guidedPage(
    [['docs/adr/0058-analysis-chart-spec-union.md', '히트맵은 두 범주축의 셀'], ['DESIGN.md', '결측값은 0·최저값·기타와 구분해 빗금으로 표시']],
    [['docs/adr/0058-analysis-chart-spec-union.md', 'threshold는 실제 승인된 판정에만 쓰고']],
  ) } },
  argTypes: { spec: { control: false } },
} satisfies Meta<typeof AnalysisChart>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 설비 × 일 가동률 히트맵. EQ-0207의 11-04는 미확인(null) 칸이고, EQ-0604의 11-03 칸을 고른 상태다. */
export const Heatmap: Story = { args: { chartId: 'sb-heat', title: '설비별 일 가동률', unit: '%', spec: {
  kind: 'heatmap', xLabels: DAYS.slice(0, 7).map(d => d.slice(5, 10)), yLabels: EQUIPMENT.map(e => e.id), cells: HEAT_CELLS, selectedCell: { x: '11-03', y: 'EQ-0604' }, scale: { type: 'sequential' },
} } };
/** 비가동 사유 구성비. 알려진 분모가 합보다 커 «미분류»가 따로 보이고, 자재 대기를 고른 상태다. */
export const Donut: Story = { args: { chartId: 'sb-donut', title: '비가동 사유', unit: '시간', spec: { kind: 'donut', slices: DOWNTIME, total: 112, selectedId: 'wait' } } };
/** 사이클타임 × 가동률 산점도. EQ-0711은 사이클타임 미측정이라 표에만 남는다. */
export const Scatter: Story = { args: { chartId: 'sb-scatter', title: '사이클타임과 가동률', unit: '%', spec: {
  kind: 'scatter', points: SCATTER, xUnit: '초', xLabel: '사이클타임', yLabel: '가동률', groups: PROCESSES.map(p => ({ id: p, label: p })), referenceLines: [{ axis: 'y', value: 85, label: '목표 85%' }],
} } };
/** 공정별 사이클타임 분포(호출자 계산 통계). 세정은 통계가 없어 미확인이다. */
export const BoxPlot: Story = { args: { chartId: 'sb-box', title: '공정별 사이클타임', unit: '초', spec: { kind: 'boxPlot', groups: CYCLE_STATS, whisker: 'minMax' } } };
/** 알람 코드 파레토: 값 내림차순 막대와 누적 % 선, 표시 한도 밖은 «기타». */
export const Pareto: Story = { args: { chartId: 'sb-pareto', title: '알람 코드 파레토', unit: '건', spec: { kind: 'pareto', items: ALARM_CODES, maxItems: 5 } } };
/** 설비 알람 순위(상위 5). EQ-0207을 고른 상태다. */
export const TopNBar: Story = { args: { chartId: 'sb-topn', title: '설비 알람 순위', unit: '건', spec: {
  kind: 'topNBar', topN: 5, defaultExpanded: true, selectedId: 'EQ-0207', items: EQUIPMENT.map(e => ({ id: e.id, label: e.id, value: e.alarms, colorToken: 'chart-series-1' as const })),
} } };
/** 설비 사이클타임 분포(값에서 구간 계산). */
export const Histogram: Story = { args: { chartId: 'sb-hist', title: '사이클타임 분포', unit: '대', spec: { kind: 'histogram', values: CYCLE_VALUES, xUnit: '초', xLabel: '사이클타임', binning: { width: 10 } } } };
