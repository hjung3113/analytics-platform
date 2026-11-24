import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { VisibilityOptionsPicker } from '@ap/components';
import { guidedPage } from '../guidance';

const OPTIONS = [{ value: 'private', label: '나만' }, { value: 'people', label: '사람 지정' }, { value: 'groups', label: '그룹' }, { value: 'official', label: '공식 신청' }];
function Picker() {
  const [value, setValue] = useState('private');
  return <div className="w-72"><VisibilityOptionsPicker label="공개 대상" value={value} onChange={setValue} options={OPTIONS} /></div>;
}

/** 새 뷰의 공개 대상 고르기. 호출자가 준 선택지를 그대로 보이고, 값은 마지막 저장에서만 쓴다. */
const meta = {
  title: '저장된 뷰/VisibilityOptionsPicker',
  component: VisibilityOptionsPicker,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/saved-view/VisibilityOptionsPicker.tsx',
    page: guidedPage([['docs/contract/kernel.md', '공유 대상: `나만 / 사람 지정 / 그룹 / 공식 신청`']], [['docs/contract/kernel.md', '공유는 권한을 주지 않는다']]),
  } },
  render: () => <Picker />,
} satisfies Meta<typeof VisibilityOptionsPicker>;
export default meta;
type Story = StoryObj;

/** 네 공개 대상. */
export const Default: Story = {};
