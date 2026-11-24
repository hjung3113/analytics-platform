import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { userEvent, within } from 'storybook/test';
import { PanelAddMenu, usePinnedPanels } from '@ap/components';
import { guidedPage } from '../guidance';
import { platformDecorator } from '../platform';
import { ADD_ITEMS } from './panels';

// The menu adds the panel itself; pinning goes to one repeated page key through `usePinnedPanels`.
function AddDemo() {
  const [shown, setShown] = useState(['trend']);
  const pinned = usePinnedPanels('pinned', ADD_ITEMS.map(item => item.id));
  return <div className="flex w-[560px] items-center justify-between gap-3 text-sm">
    <span className="text-text-secondary">패널: {shown.join(', ')} · 고정: {pinned.pinned.join(', ') || '없음'}</span>
    <PanelAddMenu items={ADD_ITEMS} shown={shown} onAdd={(id, pin) => { setShown(list => [...list, id]); if (pin) pinned.pin(id); }} />
  </div>;
}

/** «+ 패널 추가»: 메뉴가 준 패널 목록과 «추가하면 고정» 체크 하나. SDK는 고른 것을 알리고, 패널을 더하는 것은 메뉴다. */
const meta = {
  title: '페이지·작업 영역/PanelAddMenu',
  component: PanelAddMenu,
  decorators: [platformDecorator({ menu: { pageKeys: ['pinned'], repeatedPageKeys: ['pinned'] } })],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/workspace/PanelAdd.tsx',
    page: guidedPage([['docs/contract/layout.md', '고정된 패널을 다음 단계의 `panels`에 넣는 것은 메뉴다']], [['docs/contract/layout.md', '행 오른쪽 클릭 메뉴는 없다']]),
    story: { inline: false, iframeHeight: 320, autoplay: true },
  } },
  render: () => <AddDemo />,
} satisfies Meta<typeof PanelAddMenu>;
export default meta;
type Story = StoryObj;

/** 닫힌 상태: 메뉴가 고른 자리(작업 영역 도구줄 끝 등)에 놓는다. */
export const Closed: Story = {};
/** 연 상태: 이미 있는 패널은 «이미 있음», `disabledReason`이 있는 항목은 그 사유와 함께 쓸 수 없다. */
export const Open: Story = { play: async ({ canvasElement }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: /패널 추가/ })); } };
