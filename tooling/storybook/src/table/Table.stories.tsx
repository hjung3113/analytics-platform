import type { Meta, StoryObj } from '@storybook/react-vite';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

const rows = EQUIPMENT.slice(0, 5);

/** 정적 표: 작고 다 주어진 읽기 전용 표(요약·미리보기·비교·대화상자 목록). 쪽 넘김·필터·내보내기·열 설정·선택이 필요하면 `PlatformDataTable`이다. */
const meta = {
  title: '표 데이터/Table',
  component: Table,
  args: { density: 'default' },
  decorators: [Story => <div className="w-[520px]"><Story /></div>],
  render: args => <Table {...args}>
    <TableHeader><TableRow><TableHead>설비</TableHead><TableHead>공정</TableHead><TableHead align="end">가동률(%)</TableHead><TableHead align="end">알람(건)</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((e, i) => <TableRow key={e.id} current={i === 1}>
      <TableCell>{e.id}</TableCell><TableCell>{e.process}</TableCell><TableCell align="end">{e.util.toFixed(1)}</TableCell><TableCell align="end">{e.alarms}</TableCell>
    </TableRow>)}</TableBody>
  </Table>,
  parameters: { docs: {
    subtitle: '@ap/ui · packages/sdk/ui/src/components/Table.tsx',
    page: guidedPage([['docs/contract/components.md', 'Numeric headers and cells use `align="end"`']], [['docs/contract/components.md', 'There is no third size']]),
  } },
} satisfies Meta<typeof Table>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 기본 밀도, 둘째 행이 현재 행(`TableRow current`). */
export const Default: Story = {};
/** `density="compact"`: 28px 행, 옆 패널에 여섯 열 요약이 들어가는 크기. */
export const Compact: Story = { args: { density: 'compact' } };
