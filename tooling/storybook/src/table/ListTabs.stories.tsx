import type { Meta, StoryObj } from '@storybook/react-vite';
import { ListTabs } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 목록을 빠른 필터로 나누는 탭 줄(`ListToolbar`의 탭 부분). 수는 숫자만 보이고, 급한 탭은 위험 색 글자로 보인다. */
const meta = {
  title: '표 데이터/ListTabs',
  component: ListTabs,
  args: {
    ariaLabel: '설비 구분',
    activeTab: 'all',
    tabs: [{ value: 'all', label: '전체', badgeCount: 8 }, { value: 'alarm', label: '알람 있음', badgeCount: 7, urgent: true },
      { value: 'idle', label: '비가동', badgeCount: 0 }, { value: 'pm', label: '보전 예정', badgeCount: 2 }, { value: 'new', label: '신규 등록' }],
  },
  decorators: [Story => <div className="w-[640px]"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/toolbar/ListTabs.tsx',
      page: guidedPage([['docs/contract/components.md', '이유: 한 줄 툴바가 빠른 필터 몇 개만 보여 주고']]),
    },
  },
} satisfies Meta<typeof ListTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 탭 다섯, 수를 모르는 탭은 숫자 없이. */
export const Default: Story = {};

/** `maxVisible={3}`: 나머지는 「더보기 ‹숨은 수›」 메뉴 하나에 담는다. */
export const MaxVisible: Story = { args: { maxVisible: 3 } };
