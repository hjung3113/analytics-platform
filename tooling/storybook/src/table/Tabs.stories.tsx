import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const TABS = ['개요', '알람', '보전 이력', '레시피', '부품', '측정값', '변경 기록'];

/** 같은 대상의 내용을 나눠 보는 탭. `TabsList`·`TabsTrigger`는 플랫폼 선택 막대를 단 감싸개이고, 넘치는 탭은 `overflow`로 다룬다. */
const meta = {
  title: '표 데이터/Tabs',
  component: Tabs,
  args: { defaultValue: '개요' },
  render: args => <Tabs {...args} className="w-[640px]">
    <TabsList aria-label="설비 상세">{TABS.slice(0, 3).map(t => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}</TabsList>
    <TabsContent value="개요" className="pt-3"><p className="text-sm">EQ-0207 · 증착 · 가동률 72.5%</p></TabsContent>
    <TabsContent value="알람" className="pt-3"><p className="text-sm">최근 7일 알람 9건</p></TabsContent>
    <TabsContent value="보전 이력" className="pt-3"><p className="text-sm">11-04 정기 보전</p></TabsContent>
  </Tabs>,
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/components/PlatformTabs.tsx',
      page: guidedPage([['DESIGN.md', '탭 선택은 2px `accent-primary` 아래 막대'], ['docs/contract/components.md', '컨테이너가 확정된 너비를 줘야 한다']]),
    },
  },
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 탭 셋. */
export const Default: Story = {};

/** `overflow="menu"`: 들어가지 않는 탭은 「더보기」 메뉴로 옮긴다. */
export const OverflowMenu: Story = {
  args: { defaultValue: '측정값' },
  render: args => <Tabs {...args} className="w-[360px]">
    <TabsList aria-label={`${EQUIPMENT[1]!.id} 상세`} overflow="menu">{TABS.map(t => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}</TabsList>
  </Tabs>,
};
