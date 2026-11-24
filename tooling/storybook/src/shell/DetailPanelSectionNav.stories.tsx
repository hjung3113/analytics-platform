import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailPanelSectionNav, FieldList, FieldRow, PanelSectionTitle } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const SECTIONS = [{ id: 'props', label: '속성' }, { id: 'alarms', label: '알람', count: 9 }, { id: 'pm', label: '보전 이력', count: 3 }, { id: 'audit', label: '변경 기록', overflow: true }];

/**
 * 상세 패널 위에 붙는 섹션 이동 띠. 스크롤 영역 안의 `data-anchor` 섹션으로 옮기고, 보이는 섹션을 따라 선택이 바뀐다.
 * `overflow: true`인 섹션은 「더보기」 메뉴로 간다. 띠는 스크롤 영역 바로 위 형제로 둔다.
 */
const meta = {
  title: '셸·패널/DetailPanelSectionNav',
  component: DetailPanelSectionNav,
  args: { sections: SECTIONS, navigationLabel: '설비 상세 섹션' },
  render: function Render(args) {
    const scrollRef = useRef<HTMLDivElement>(null);
    return <div className="flex h-[360px] w-detail-panel flex-col border border-border-subtle bg-surface-detail">
      <DetailPanelSectionNav {...args} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">{SECTIONS.map(s => <section key={s.id} data-anchor={s.id} className="mb-6">
        <PanelSectionTitle>{s.label}</PanelSectionTitle>
        <FieldList>{EQUIPMENT.slice(0, 4).map(e => <FieldRow key={e.id} layout="detail" label={e.id}>{e.process} · 알람 {e.alarms}건</FieldRow>)}</FieldList>
      </section>)}</div>
    </div>;
  },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/panel/DetailPanelSectionNav.tsx',
      page: guidedPage([['docs/contract/components.md', '메뉴가 좁은 폭의 섹션 이동']]),
    },
  },
} satisfies Meta<typeof DetailPanelSectionNav>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 섹션 넷, 마지막은 더보기 메뉴. */
export const Default: Story = {};
