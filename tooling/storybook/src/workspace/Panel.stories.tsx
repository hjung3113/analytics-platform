import type { Meta, StoryObj } from '@storybook/react-vite';
import { Panel } from '@ap/components';
import { Button } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const list = <ul className="grid gap-1 text-sm">{EQUIPMENT.slice(0, 4).map(e => <li key={e.id} className="flex justify-between"><span>{e.id}</span><span className="tabular">{e.util.toFixed(1)}%</span></li>)}</ul>;

/** `PlatformPage` 안의 구역 카드: 제목·부제·오른쪽 동작과 본문. Overview·Catalog·Workflow 템플릿이 이것으로 구역을 쌓는다. */
const meta = {
  title: '페이지·작업 영역/Panel',
  component: Panel,
  args: { title: '먼저 볼 설비', subtitle: '가동률 낮은 순', children: list },
  argTypes: { children: { control: false }, actions: { control: false } },
  decorators: [Story => <div className="w-[420px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/archetypes/PlatformPage.tsx',
    page: guidedPage(),
  } },
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 제목·부제와 본문. */
export const Default: Story = {};
/** `actions`: 머리 오른쪽의 구역 동작. */
export const WithActions: Story = { args: { actions: <Button size="sm" variant="ghost">전체 보기</Button> } };
