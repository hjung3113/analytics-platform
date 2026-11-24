import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SegmentedRadio } from '@ap/components';
import { guidedPage } from '../guidance';

const OPTIONS = [{ value: 'day', label: '일' }, { value: 'week', label: '주' }, { value: 'month', label: '월' }] as const;
type Grain = typeof OPTIONS[number]['value'];
function Grains({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState<Grain>('week');
  return <div className="flex items-center gap-2">
    <SegmentedRadio label="집계 단위" value={value} onChange={setValue} options={OPTIONS} disabled={disabled} describedBy={disabled ? 'grain-why' : undefined} />
    {disabled && <span id="grain-why" className="t-caption text-text-secondary">기간이 하루라 일 단위만 됩니다</span>}
  </div>;
}

/** 붙은 버튼 모양의 라디오 그룹. 화살표·Home·End로 옮기며 고르고, 고른 항목을 다시 눌러도 `onActivate`가 온다. */
const meta = {
  title: '폼/SegmentedRadio',
  component: SegmentedRadio,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/RadioGroup.tsx',
    page: guidedPage(),
  } },
  render: () => <Grains />,
} satisfies Meta<typeof SegmentedRadio>;
export default meta;
type Story = StoryObj;

/** 주 단위를 고른 상태. */
export const Default: Story = {};
/** `disabled`와 `describedBy`: 그룹은 남고 이유를 옆에 적는다. */
export const Disabled: Story = { render: () => <Grains disabled /> };
