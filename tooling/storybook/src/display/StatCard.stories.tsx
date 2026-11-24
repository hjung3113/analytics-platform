import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Gauge, Timer } from 'lucide-react';
import { StatCard } from '@ap/components';
import { guidedPage } from '../guidance';

/** KPI 칸 하나: 아이콘·이름·값·단위, 기준이 있는 증감과 보조 문구. 누르면 그 지표를 고르는 버튼이 된다(`onClick`·`active`). */
const meta = {
  title: '표시/StatCard',
  component: StatCard,
  args: { icon: Gauge, chip: 'blue', label: '평균 가동률', value: '86.2', unit: '%', delta: { value: '+1.8%p', direction: 'up', good: true }, caption: '11-01 – 11-14, 전 기간 대비' },
  argTypes: { icon: { control: false } },
  decorators: [Story => <div className="w-64"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/state/StatCard.tsx',
    page: guidedPage([['DESIGN.md', 'icon·label·값·단위·기준이 있는 delta·보조 caption으로 구성한다']], [['DESIGN.md', '한 tile에 무관한 두 primary 값을 쌓지 않는다'], ['DESIGN.md', 'unknown을 0 또는 0%로 만들지 않는다']]),
  } },
} satisfies Meta<typeof StatCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 가동률: 오른 것이 좋은 증감(`good: true`). */
export const Default: Story = {};
/** 알람: 오른 것이 나쁜 증감(`good: false`), `teal` 칩. */
export const BadRise: Story = { args: { icon: Bell, chip: 'teal', label: '알람', value: '27', unit: '건', delta: { value: '+6건', direction: 'up', good: false }, caption: '증착 15건' } };
/** `secondary`: 같은 칸의 짝 숫자(P50 옆 P95). */
export const Paired: Story = { args: { icon: Timer, label: '사이클타임 P50 / P95', value: '139', unit: '초', secondary: '/ 172', delta: undefined, caption: '공정 3개' } };
/** `onClick`·`active`: 지표를 고르는 칸. 고른 칸은 눌린 상태다. */
export const Selectable: Story = { args: { onClick: () => undefined, active: true } };
