import type { Meta, StoryObj } from '@storybook/react-vite';
import { LaneTimeline } from '@ap/components';
import { LANES } from '../equipment';
import { guidedPage } from '../guidance';

/** 설비별 상태 구간을 시간 위에 그리는 Canvas 시간선(ADR-0064). 시간은 시간대 없는 설비 wall-clock을 epoch ms로 인코딩해 받는다. */
const meta = {
  title: '데이터 시각화/LaneTimeline',
  component: LaneTimeline,
  parameters: { docs: { page: guidedPage(
    [['docs/adr/0064-topn-bar-and-lane-timeline.md', 'React 렌더 없이 수십만 구간을 다룰 수 있기']],
    [['docs/adr/0064-topn-bar-and-lane-timeline.md', '기존 시간축 Frame을 대체하지 않는다']],
  ) } },
  args: { lanes: LANES, ariaLabel: '설비 상태 시간선 11-14', height: 200 },
  argTypes: { lanes: { control: false } },
} satisfies Meta<typeof LaneTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 설비 다섯 대의 하루 상태(가동·대기·정지). EQ-0207은 13–15시 기록이 없어 빈 칸이다. */
export const States: Story = {};
/** EQ-0207의 첫 구간을 고른 상태(`selectedId`). 선택 요약이 구간을 글로 적는다. */
export const Selected: Story = { args: { selectedId: 'EQ-0207-0' } };
/** 구간 선택(`rangeBrush`)으로 11–14시를 고른 상태. 선택 요약에 구간과 `선택 구간 확대`가 보인다. */
export const RangeBrush: Story = { args: { rangeBrush: { defaultValue: [Date.UTC(2026, 10, 14, 11), Date.UTC(2026, 10, 14, 14)] } } };
