import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { userEvent, within } from 'storybook/test';
import { MatrixLevelOrder } from '@ap/components';
import { guidedPage } from '../guidance';

const LEVELS = [{ id: 'process', label: '공정' }, { id: 'equipment', label: '설비' }, { id: 'module', label: '모듈' }, { id: 'recipe', label: '레시피' }];
const DEFAULT = ['process', 'equipment'];
function Order() {
  const [value, setValue] = useState(['equipment', 'process', 'module']);
  return <div className="flex items-center gap-3">
    <MatrixLevelOrder label="행 단계" levels={LEVELS} value={value} defaultValue={DEFAULT} onChange={setValue} />
    <span className="t-caption text-text-secondary">{value.map(id => LEVELS.find(l => l.id === id)!.label).join(' → ')}</span>
  </div>;
}

/** 행렬 행 단계의 부분집합과 순서를 고르는 팝오버. 표 «컬럼» 팝오버와 같은 체크박스·위/아래 버튼·«기본값으로»를 쓴다. */
const meta = {
  title: '행렬/MatrixLevelOrder',
  component: MatrixLevelOrder,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/matrix/MatrixLevelOrder.tsx',
    page: guidedPage([['docs/contract/components.md', '소비자가 page key에 저장하고 서버가 재그룹한다']]),
    story: { inline: false, iframeHeight: 320, autoplay: true },
  } },
  render: () => <Order />,
} satisfies Meta<typeof MatrixLevelOrder>;
export default meta;
type Story = StoryObj;

/** 설비 → 공정 → 모듈 순서를 고른 상태에서 팝오버를 연다. 레시피는 빠져 있다. */
export const Open: Story = { play: async ({ canvasElement }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: '행 단계' })); } };
