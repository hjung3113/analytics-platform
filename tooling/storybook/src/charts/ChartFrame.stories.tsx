import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { AnalysisChartFrame } from '@ap/components';
import { ALARM_SERIES, UTIL_PREVIOUS, UTIL_SERIES } from '../equipment';
import { guidedPage } from '../guidance';
import { platformDecorator } from '../platform';

// Compare, Annotate and Export follow the menu's features (chart.md §16), so this page's menu turns them on, with a Scope and a period.
const NOTE = { id: 'n1', chartId: 'sb-annotate', scopeId: 'fab1', from: '2026-11-06T00:00:00', to: '2026-11-08T00:00:00', text: '증착 계측 서버 점검(미측정)', at: '2026-11-08T09:00:00', mine: true };
// Each state story is shown already in its state: `play` presses the tools on the docs page too (`docs.story.autoplay`).
// The plays of one docs page run together, so a click must not wait for another story's open Select to release the page.
const user = userEvent.setup({ pointerEventsCheck: 0 });
const press = (name: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await user.click(await within(canvasElement).findByRole('button', { name }));
};
const choose = async (canvasElement: HTMLElement, select: string, option: string) => {
  await user.click(await within(canvasElement).findByRole('combobox', { name: select }));
  await user.click(await within(document.body).findByRole('option', { name: option }));
};
/** Brush on, then 11-04 – 11-09 through the start/end pickers (the keyboard path of the same range). */
const brush = async (ctx: { canvasElement: HTMLElement }) => {
  await press('구간 선택')(ctx);
  await choose(ctx.canvasElement, '구간 시작', '2026-11-04 00:00');
  await choose(ctx.canvasElement, '구간 끝', '2026-11-09 00:00');
  await press('선택')(ctx);
};

/** 선·막대 차트와 공통 상호작용(확대·구간 선택·초기화·비교·주석·표로 보기)을 가진 분석 차트 틀(chart.md §16). 시간은 시간대 없는 설비 wall-clock이고 null은 0이 아닌 미측정이다. */
const meta = {
  title: '데이터 시각화/Chart Frame',
  component: AnalysisChartFrame,
  decorators: [platformDecorator({ features: { compare: true, annotate: true, export: true }, address: '/?scopeId=fab1&from=2026-11-01T00:00:00&to=2026-11-15T00:00:00', annotations: [NOTE] })],
  parameters: { docs: { page: guidedPage(
    [['docs/contract/chart.md', 'Compare·Annotate·Export는 현재 메뉴 manifest의 `features`(§5)를 따른다'], ['DESIGN.md', 'textual summary, 동일 데이터 table 접근 경로']],
    [['DESIGN.md', '단순 chart click으로 조용히 조건을 바꾸지 않는다'], ['DESIGN.md', '`chart-status-*`는 실제 판정일 때만 쓴다']],
  ), story: { autoplay: true } } },
  args: { chartId: 'sb-util', title: '공정별 일 가동률', unit: '%', series: UTIL_SERIES, xType: 'time' },
  argTypes: { series: { control: false }, compareSeries: { control: false } },
} satisfies Meta<typeof AnalysisChartFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 시간축 선 차트. 증착은 11-06·11-07이 미측정이라 선이 끊긴다. */
export const Line: Story = {};
/** 확대를 한 번 누른 상태. 축소·좌우 이동이 생긴다. */
export const Zoomed: Story = { args: { chartId: 'sb-zoom' }, play: press('확대') };
/** 구간 선택을 켜고 11-04 – 11-09를 고른 상태. 선택 요약에 시리즈별 n·평균·최대가 나온다. */
// Its own iframe: on the shared docs page the other stories' plays raced the range pickers and the narrowed end did not stick.
export const Brushed: Story = { args: { chartId: 'sb-brush' }, play: brush, parameters: { docs: { story: { inline: false, height: '600px' } } } };
/** 비교를 켠 상태. 전 기간 시리즈가 점선으로 겹친다. */
export const Compared: Story = { args: { chartId: 'sb-compare', compareSeries: UTIL_PREVIOUS }, play: press('비교') };
/** 저장된 주석이 그려지고, 전체 구간을 고른 뒤 새 주석을 쓰는 편집기가 열린 상태. */
export const Annotated: Story = { args: { chartId: 'sb-annotate' }, play: async ctx => { for (const name of ['구간 선택', '선택', '주석']) await press(name)(ctx); } };
/** 표로 보기를 켠 상태. 차트와 같은 데이터를 표로 읽는다(미측정 칸 포함). */
export const AsTable: Story = { args: { chartId: 'sb-table' }, play: press('표로 보기') };
/** 범주축 세로 막대: 설비별 알람 종류. */
export const Bars: Story = { args: { chartId: 'sb-bars', title: '설비별 알람', unit: '건', xType: 'category', series: ALARM_SERIES } };
/** 가로 범주 막대에서 EQ-0207 행을 고른 상태(`activeCategory`). EQ-0315의 이송은 기록이 없다. */
export const HorizontalSelected: Story = { args: { ...Bars.args, chartId: 'sb-horizontal', orientation: 'horizontal', activeCategory: 'EQ-0207', rowPitch: 28 } };
/** 누적 막대(`stackMode="stack"`, 더할 수 있는 측정). */
export const Stacked: Story = { args: { ...HorizontalSelected.args, chartId: 'sb-stack', stackMode: 'stack', reaggregation: 'sum', valueLabels: 'total' } };
/** 100% 누적 막대(`stackMode="percent"`): 행마다 보이는 값의 합이 분모다. */
export const Percent: Story = { args: { ...Bars.args, chartId: 'sb-percent', stackMode: 'percent', reaggregation: 'sum' } };
