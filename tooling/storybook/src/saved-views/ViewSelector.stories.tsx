import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { userEvent, within } from 'storybook/test';
import { ViewSelector, type ViewFilter, type ViewSelectorState } from '@ap/components';
import { guidedPage } from '../guidance';
import { GROUPS, ME, personName, VIEWS } from './views';

function Selector({ state }: { state: ViewSelectorState }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ViewFilter>('all');
  const [current, setCurrent] = useState<string | null>('v-etch');
  return <ViewSelector views={VIEWS} currentId={current} defaultId="v-std" state={state} userId={ME} groups={GROUPS} ownerLabel={personName}
    query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} onSelect={setCurrent} onSave={() => true} onSaveAs={() => true}
    onRevert={() => undefined} onMakeDefault={() => undefined} onDelete={() => undefined} onManage={() => undefined} />;
}
const openList = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: /저장된 뷰/ }));
};

/** 조회 도구행의 현재 뷰 선택기. 이름 검색·공유 대상 필터·현재 체크·«내 기본» 표식·«수정됨»·저장 메뉴를 한 자리에 둔다. */
const meta = {
  title: '저장된 뷰/ViewSelector',
  component: ViewSelector,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/saved-view/ViewSelector.tsx',
    page: guidedPage(
      [['docs/contract/kernel.md', '`현재 뷰에 저장`과 `새 뷰로 저장`은 분리한다'], ['docs/contract/kernel.md', '역할 하나로 가르지 않는다']],
      [['docs/contract/kernel.md', '추가 고정 행을 만들지 않고']],
    ),
    story: { inline: false, iframeHeight: 520, autoplay: true },
  } },
  render: () => <Selector state="clean" />,
  play: openList,
} satisfies Meta<typeof ViewSelector>;
export default meta;
type Story = StoryObj;

/** 목록을 연 상태: 내 뷰, 그룹 공유, 공식, 승인 대기·반려, 열 수 없는 뷰. */
export const Open: Story = {};
/** `state="modified"`: 적용 조건이 저장본과 달라 «수정됨»과 «저장본으로 되돌리기»가 보인다. */
export const Modified: Story = { render: () => <Selector state="modified" />, play: undefined };
