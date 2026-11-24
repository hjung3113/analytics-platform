import type { Meta, StoryObj } from '@storybook/react-vite';
import { TableQuickSearch } from '@ap/components';
import { guidedPage } from '../guidance';
import { platformDecorator } from '../platform';

// The menu declares the search key `q` and the page index it resets.
const searchPage = (address = '/') => platformDecorator({ address, menu: { pageKeys: ['q', 'page'] } });

/** 표 툴바의 빠른 검색. 메뉴가 준 page key에 적용값을 두고, 입력은 Enter를 눌러야 적용된다(조합 중 Enter는 글자만 확정). 비우면 곧바로 적용된다. */
const meta = {
  title: '조회·필터/TableQuickSearch',
  component: TableQuickSearch,
  args: { pageKey: 'q', label: '설비 검색', placeholder: '설비 ID 검색' },
  decorators: [Story => <div className="w-80"><Story /></div>, searchPage()],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/table/TableQuickSearch.tsx',
    page: guidedPage([['docs/contract/components.md', '초안은 Enter에만 적용되고'], ['DESIGN.md', '빠른 검색은 표 툴바 줄에 둔다']]),
  } },
} satisfies Meta<typeof TableQuickSearch>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 적용값 없음. */
export const Default: Story = {};
/** 주소에 `q=EQ-02`가 있어 그 값이 칸에 들어 있다. */
export const Applied: Story = { decorators: [searchPage('/?q=EQ-02')] };
