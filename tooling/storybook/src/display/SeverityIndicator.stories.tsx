import type { Meta, StoryObj } from '@storybook/react-vite';
import { SeverityIndicator } from '@ap/ui';
import { guidedPage } from '../guidance';

/** 세 막대로 심각도를 보이는 표시. 막대 수와 색이 함께 바뀌고 접근 이름은 «심각도 높음»처럼 읽힌다. */
const meta = {
  title: '표시/SeverityIndicator',
  component: SeverityIndicator,
  args: { severity: 'high' },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/indicators/SeverityIndicator.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof SeverityIndicator>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 높음. */
export const Default: Story = {};

/** 네 단계와 미지정(`null`)을 알람 설비 옆에 둔다. */
export const Levels: Story = {
  render: () => <div className="grid gap-2 text-sm">{([['EQ-0315', null], ['EQ-0604', 'low'], ['EQ-0412', 'medium'], ['EQ-0519', 'high'], ['EQ-0207', 'critical']] as const).map(([id, severity]) =>
    <div key={id} className="flex items-center gap-3"><SeverityIndicator severity={severity} /><span className="t-mono">{id}</span><span className="text-text-secondary">{severity ?? '미지정'}</span></div>)}</div>,
};
