import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmbeddedPane, PlatformDataTable } from '@ap/components';
import { COLUMNS, EQUIPMENT, type Eq } from '../equipment';
import { guidedPage } from '../guidance';
import { withPlatform } from '../platform';

const Table = () => <PlatformDataTable<Eq> title="설비" ariaLabel="설비 표" columns={COLUMNS} rows={EQUIPMENT.slice(0, 5)} getRowId={e => e.id} preferenceKey="storybook:embedded:v1" />;

/** 자기 테두리를 그리는 호스트(보드 칸 등)가 화면을 감싸는 틀. 안의 차트 프레임·표는 자기 카드 테두리·모서리·바깥 여백을 그리지 않는다. */
const meta = {
  title: '페이지·작업 영역/EmbeddedPane',
  component: EmbeddedPane,
  decorators: [withPlatform],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/workspace/panelContext.ts',
    page: guidedPage([['docs/contract/layout.md', 'Hosts that draw their own bordered container wrap the screen in `EmbeddedPane`']]),
  } },
  render: () => <div className="w-[720px] rounded-md border border-border-subtle bg-surface-card"><EmbeddedPane><Table /></EmbeddedPane></div>,
} satisfies Meta<typeof EmbeddedPane>;
export default meta;
type Story = StoryObj;

/** 호스트가 테두리를 그리고 표는 자기 테두리 없이 들어간다. */
export const InHost: Story = {};
/** 비교: `EmbeddedPane` 없이 같은 호스트에 넣으면 테두리가 겹친다. */
export const WithoutPane: Story = { render: () => <div className="w-[720px] rounded-md border border-border-subtle bg-surface-card"><Table /></div> };
