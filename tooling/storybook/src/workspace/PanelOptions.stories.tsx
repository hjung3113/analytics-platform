import type { Meta, StoryObj } from '@storybook/react-vite';
import { PanelOptions } from '@ap/components';
import { guidedPage } from '../guidance';
import { AlarmPanel, optionsPage } from './panels';

/** 메뉴가 선언한 패널 보기 설정(정렬·묶음·켬/끔)을 SDK가 그린다. 값은 메뉴의 page key에 두고, `usePanelOptions`와 짝지어 쓴다. */
const meta = {
  title: '페이지·작업 영역/PanelOptions',
  component: PanelOptions,
  decorators: [Story => <div className="w-[720px]"><Story /></div>, optionsPage()],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/workspace/PanelOptions.tsx',
    page: guidedPage([['docs/contract/layout.md', '놓는 자리는 메뉴가 고른다']], [['docs/contract/layout.md', '패널 옵션은 자유 형식 `chartOptions` 슬롯에 넣지 않는다']]),
  } },
  render: () => <AlarmPanel />,
} satisfies Meta<typeof PanelOptions>;
export default meta;
type Story = StoryObj;

/** 넓은 패널: 값 셋인 정렬은 `<이름>: <값> ▾` 메뉴, 값 둘인 묶음은 두 칸 전환, 켬/끔은 상태를 글자로 말한다. */
export const Inline: Story = {};
/** 패널 폭이 `collapseBelow`(기본 480px) 미만이거나 `collapsed`이면 `보기 ▾` 하나로 접힌다. */
export const Folded: Story = { render: () => <AlarmPanel collapsed /> };
