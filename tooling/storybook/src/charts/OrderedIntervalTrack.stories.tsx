import type { Meta, StoryObj } from '@storybook/react-vite';
import { OrderedIntervalTrack } from '@ap/components';
import { TRACK_ITEMS, TRACK_LANES, TRACK_STATES } from '../equipment';
import { guidedPage } from '../guidance';

/** 순서 축 위의 구간·점 트랙(ADR-0121). 위치는 메뉴가 준 서수(로그 줄 번호)이고 시간으로 다시 정렬하지 않는다. 짝 맞추기·전이 판정은 메뉴 몫이다. */
const meta = {
  title: '데이터 시각화/OrderedIntervalTrack',
  component: OrderedIntervalTrack,
  parameters: { docs: { page: guidedPage(
    [['docs/adr/0121-ordered-interval-track-sdk-piece.md', '메뉴는 줄·상태 이름·색 토큰 매핑·항목을 선언하고'], ['docs/contract/components.md', '항목 부재만으로 미수신을 추론하지 않는다']],
    [['docs/contract/chart.md', '표시용 시간을 기준으로 재정렬하지 않는다'], ['docs/contract/chart.md', '파일 경계·시간 역전을 추론하지 않는다']],
  ) } },
  args: { ariaLabel: '설비 로그 순서 트랙', lanes: TRACK_LANES, items: TRACK_ITEMS, states: TRACK_STATES, domain: [0, 210], axisLabel: '로그 줄', height: 200,
    markers: [{ order: 100, label: '로그 파일 경계', kind: 'boundary' }], partialGaps: [{ orderStart: 150, orderEnd: 165 }] },
  argTypes: { lanes: { control: false }, items: { control: false }, states: { control: false } },
} satisfies Meta<typeof OrderedIntervalTrack>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 설비 세 대의 가동·대기·정지 구간. EQ-0142 첫 구간은 이전 파일에서 이월(꺾쇠), EQ-0207 마지막 구간은 끝 미확인(점선), 150–165줄은 미수신, 100줄에 파일 경계 표식. */
export const Track: Story = {};
/** EQ-0207의 진공 알람(점 이벤트)을 고른 상태(`selectedId`). 선택 요약이 항목을 글로 적는다. */
export const Selected: Story = { args: { selectedId: 'EQ-0207-alarm' } };
/** 메뉴가 넘긴 상태(`state`): 일부만 받은 응답. 받은 항목은 그대로 그린다. */
export const Partial: Story = { args: { state: { kind: 'partial', title: '일부 로그만 받음', body: '150–165줄을 받지 못했다.' } } };
