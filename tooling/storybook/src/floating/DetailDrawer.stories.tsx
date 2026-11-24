import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailDrawer } from '@ap/components';
import { DetailPanelSlotProvider, FieldList, FieldRow, StatusBadge, useDetailPanelSlotHost } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const eq = EQUIPMENT[1]!;
// The shell owns the docked slot; here a list stands in for the page body and an aside for the shell's slot host.
function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" className="flex w-detail-panel shrink-0 flex-col border-l border-border-subtle bg-surface-detail" />;
}
const Properties = () => <FieldList>
  <FieldRow layout="detail" label="공정">{eq.process}</FieldRow>
  <FieldRow layout="detail" label="가동률(%)">{eq.util.toFixed(1)}</FieldRow>
  <FieldRow layout="detail" label="사이클타임(초)">{eq.cycle}</FieldRow>
  <FieldRow layout="detail" label="알람(건)">{eq.alarms}</FieldRow>
</FieldList>;

/** 셸 오른쪽 고정 슬롯에 붙는 비모달 상세. 목록은 계속 조작할 수 있고 열림은 페이지의 `focus` 키가 정한다. */
const meta = {
  title: '떠 있는 표면/DetailDrawer',
  component: DetailDrawer,
  decorators: [Story => <DetailPanelSlotProvider><div className="flex h-[420px] bg-surface-canvas">
    <main className="flex-1 p-4 text-sm text-text-secondary">설비 목록(페이지 본문)<Story /></main><SlotHost />
  </div></DetailPanelSlotProvider>],
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 440 },
      subtitle: '@ap/components · packages/sdk/components/src/drawer/DetailDrawer.tsx',
      page: guidedPage(
        [['docs/contract/components.md', '렌더 대상은 셸 소유 오른쪽 고정 상세 슬롯이다'], ['docs/contract/components.md', '소비자는 표시용 `id`와 `title`을 따로 넘긴다']],
        [['docs/contract/components.md', '포커스 trap은 없으며 패널 밖 Esc는 상세를 닫지 않는다'], ['DESIGN.md', '셸 전체 높이를 쓰고 그림자·scrim은 없다']],
      ),
    },
  },
} satisfies Meta<typeof DetailDrawer>;
export default meta;
type Story = StoryObj;

/** 열린 상세: 모노 ID와 제목, 탭 둘(속성·이력). */
export const Open: Story = {
  render: () => <DetailDrawer id={eq.id} title="증착 설비" focusOnOpen={false} onClose={() => {}} subtitle={<StatusBadge tone="warning" dot>점검 필요</StatusBadge>}
    tabs={[{ id: 'props', label: '속성', content: <Properties /> }, { id: 'history', label: '이력', content: <p className="p-5 text-sm">최근 알람 9건</p> }]} />,
};

/** 찾을 수 없는 항목(`missing`): 삭제됐거나 볼 권한이 없다. */
export const Missing: Story = { render: () => <DetailDrawer missing id="EQ-0999" focusOnOpen={false} onClose={() => {}} /> };
