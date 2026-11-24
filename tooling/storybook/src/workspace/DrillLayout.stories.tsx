import type { Meta, StoryObj } from '@storybook/react-vite';
import { DrillLayout } from '@ap/components';
import { guidedPage } from '../guidance';
import { drillPage, SIBLINGS, STEP2, StepBody } from './drill';

/** 드릴다운 페이지 본문: 맨 위 경로 바(`DrillPath`)와 현재 단계 본문. 단계 값은 메뉴가 선언한 page key에 있고 본문은 메뉴가 정한다. */
const meta = {
  title: '페이지·작업 영역/DrillLayout',
  component: DrillLayout,
  args: { siblings: SIBLINGS },
  argTypes: { siblings: { control: false }, children: { control: false } },
  decorators: [Story => <div className="w-[720px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/archetypes/DrillLayout.tsx',
    page: guidedPage(
      [['docs/contract/layout.md', '단계 진입은 행 끝 들어가기 버튼(접근 이름 `<값> 들어가기`)처럼 눈에 보이는 동작으로 한다']],
      [['docs/contract/layout.md', '행 전체 클릭은 진입 동작으로 쓰지 않는다(교차 필터와 구분)']],
    ),
  } },
  render: args => <DrillLayout {...args}><StepBody /></DrillLayout>,
} satisfies Meta<typeof DrillLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 0단계: 경로 바 없이 메뉴의 요약 본문만 있다. «들어가기»로 한 단계씩 내려간다. */
export const Start: Story = { decorators: [drillPage()] };
/** 2단계(1공장 › 식각)와 한 줄 `summary`. 칩 옆 ▾로 같은 단계의 다른 값으로 바꾼다. */
export const Step: Story = { args: { summary: '식각 설비 3대 · 평균 가동 90.7%' }, decorators: [drillPage(STEP2)] };
/** `notFound`: 결과에 없는 값은 본문 자리에 상태로 보이고 다른 값으로 바꾸지 않는다. */
export const NotFound: Story = { args: { notFound: { key: 'drillProcess', value: '식각' } }, decorators: [drillPage(STEP2)] };
