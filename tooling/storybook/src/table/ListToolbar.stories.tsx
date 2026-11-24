import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, ListToolbar } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 목록 위 50px 띠. 탭(또는 제목)과 동작을 한 줄에 두고, 폭이 모자라면 동작이 둘째 줄로 내려간다. */
const meta = {
  title: '표 데이터/ListToolbar',
  component: ListToolbar,
  args: {
    tabs: [{ value: 'all', label: '전체', badgeCount: 8 }, { value: 'alarm', label: '알람 있음', badgeCount: 7 }, { value: 'idle', label: '비가동', badgeCount: 0 }],
    activeTab: 'all',
    tabsAriaLabel: '설비 구분',
    action: <Button size="toolbar" variant="secondary">설비 추가</Button>,
  },
  decorators: [Story => <div className="relative w-[720px] border border-border-subtle"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/toolbar/ListToolbar.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '`ListTabs`·`ListToolbar`(`@ap/ui`)의 선택 prop'], ['DESIGN.md', '공유 semantic token/primitive를 `@ap/ui`로 소비']],
        [['DESIGN.md', '모든 divider를 진하게 하거나']],
      ),
    },
  },
} satisfies Meta<typeof ListToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 탭 셋과 동작 하나. */
export const Default: Story = {};

/** 탭 대신 제목만 둔 띠. */
export const TitleOnly: Story = { args: { tabs: undefined, title: '설비 목록' } };

/** `tabsMaxVisible`: 앞 두 개만 띠에 두고 나머지는 「더보기」 메뉴로 접는다. */
export const Collapsed: Story = { args: { tabsMaxVisible: 2 } };
