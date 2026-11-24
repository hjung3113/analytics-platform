import type { Meta, StoryObj } from '@storybook/react-vite';
import { Dot, StatusBadgeFrame } from '@ap/ui';
import { guidedPage } from '../guidance';

const TONES = [['success', '가동'], ['warning', '점검 필요'], ['danger', '정지'], ['muted', '미수집']] as const;

/** 상태 배지의 모양 틀. 상태 → 글자·tone 대응은 호출자가 가진다. 플랫폼 공통 상태는 StatusBadge가 맡는다. */
const meta = {
  title: '표시/StatusBadgeFrame',
  component: StatusBadgeFrame,
  args: { appearance: 'severity', tone: 'warning', children: '점검 필요', indicator: <Dot tone="warning" /> },
  argTypes: { indicator: { control: false } },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/badges/StatusBadgeFrame.tsx',
      page: guidedPage(
        [['DESIGN.md', 'text+icon/shape로 의미를 함께 전달한다']],
        [['DESIGN.md', '평범한 label에 새 상태 색을 만들지 않는다']],
      ),
    },
  },
} satisfies Meta<typeof StatusBadgeFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 점과 글자가 있는 `severity` 모양. */
export const Default: Story = {};

/** `appearance` 일곱 가지(tone `success`). */
export const Appearances: Story = {
  render: () => <div className="flex flex-wrap items-center gap-2">{(['reporter', 'task', 'severity', 'compact', 'compact-identity', 'compact-outline', 'link'] as const)
    .map(appearance => <StatusBadgeFrame key={appearance} appearance={appearance} tone="success">{appearance}</StatusBadgeFrame>)}</div>,
};

/** tone별 `compact`: 표 행 안 상태. */
export const Tones: Story = {
  render: () => <div className="flex gap-2">{TONES.map(([tone, label]) => <StatusBadgeFrame key={tone} appearance="compact" tone={tone}>{label}</StatusBadgeFrame>)}</div>,
};
