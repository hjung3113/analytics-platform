import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExternalLink, PanelRightOpen } from 'lucide-react';
import { RowAction } from '@ap/components';
import { guidedPage } from '../guidance';

/** 표 동작 열의 행 동작 하나. 일반 형태는 글자, 좁은 compact 형태(72px)는 아이콘과 툴팁이고, 같은 요소라 전환해도 포커스가 남는다. */
const meta = {
  title: '표 데이터/RowAction',
  component: RowAction,
  args: { compact: false, icon: PanelRightOpen, label: 'EQ-0207 상세 열기', text: '상세' },
  argTypes: { icon: { control: false }, link: { control: false }, menu: { control: false } },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/drawer/RowAction.tsx',
    page: guidedPage([['docs/contract/components.md', '모든 동작은 같은 접근 가능한 이름의 아이콘 버튼·링크이고']]),
  } },
} satisfies Meta<typeof RowAction>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 일반 형태(툴바 버튼). */
export const Full: Story = {};
/** compact 형태: 아이콘만, 글자는 hover·포커스 툴팁. */
export const Compact: Story = { args: { compact: true } };
/** 글자 링크(`textLink="primary"`)로 다른 화면을 연다. */
export const TextLink: Story = { args: { icon: ExternalLink, label: 'EQ-0207 정비 이력 열기', text: '정비 이력', textLink: 'primary', link: <a href="#maintenance" /> } };
/** `menu`: 같은 컨트롤이 동작 목록 Popover를 연다. */
export const WithMenu: Story = { args: { text: '더보기', label: 'EQ-0207 동작', menu: <ul className="p-1 text-sm"><li className="px-2 py-1">상세 열기</li><li className="px-2 py-1">비교에 추가</li></ul> } };
