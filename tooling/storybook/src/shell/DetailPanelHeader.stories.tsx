import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailPanelHeader, DetailPanelHeaderActions, DropdownMenuItem } from '@ap/ui';
import { guidedPage } from '../guidance';

const notify = { success: () => {}, error: () => {} };

/**
 * 상세 패널 머리. 종류 라벨·표시용 `id`·제목·메타를 한 줄(`h-toolbar`)에 두고, 오른쪽에 `extras`와 닫기를 둔다.
 * `DetailPanelHeaderActions`는 `extras`에 넣는 링크 복사와 ⋮ 더보기 메뉴다.
 */
const meta = {
  title: '셸·패널/DetailPanelHeader',
  component: DetailPanelHeader,
  args: {
    label: '설비', accent: 'info', id: 'EQ-0207', title: '증착 2라인 챔버 B', metadata: '최근 보전 11-04', onClose: () => {}, closeLabel: '닫기',
    extras: <DetailPanelHeaderActions copyUrl="/equipment?focus=EQ-0207" notify={notify}
      extraMore={<><DropdownMenuItem>보전 이력 열기</DropdownMenuItem><DropdownMenuItem>알람 규칙 보기</DropdownMenuItem></>} />,
  },
  argTypes: { extras: { control: false } },
  decorators: [Story => <div className="w-detail-panel border border-border-subtle bg-surface-detail"><Story /></div>],
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/panel/DetailPanelHeader.tsx · DetailPanelHeaderActions.tsx',
      page: guidedPage([['docs/contract/components.md', '소비자는 표시용 `id`와 `title`을 따로 넘긴다'], ['docs/contract/components.md', '`titleLines={2}`를 넘기면']]),
    },
  },
} satisfies Meta<typeof DetailPanelHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 줄무늬 종류 표시, 링크 복사·더보기·닫기. */
export const Default: Story = {};

/** `titleLines={2}`: 긴 제목을 두 줄까지 보이고 메타는 제목 아래 줄로 내린다. */
export const TwoLineTitle: Story = { args: { titleLines: 2, title: '증착 2라인 챔버 B — 진공 알람 반복으로 정기 보전 앞당김 검토 중' } };

/** `appearance="badge"`: 종류를 배지로만 보인다. */
export const Badge: Story = { args: { appearance: 'badge', accent: 'warn', label: '알람' } };

/** 기록을 아직 못 읽은 동안: `id`·제목 없이 머리와 닫기만. */
export const Pending: Story = { args: { id: undefined, title: undefined, metadata: undefined, extras: undefined } };
