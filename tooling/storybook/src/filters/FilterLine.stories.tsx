import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { ColumnFilter } from '@ap/contracts';
import { FilterLine, type TableFilterField } from '@ap/components';
import { PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

// The same field declaration as PlatformDataTable.filterFields: 공정 pinned as a button, 가동률 and 설비 behind «+ 필터».
const FIELDS: TableFilterField[] = [
  { id: 'process', label: { ko: '공정', en: 'Process' }, pinned: true, spec: { kind: 'enum', options: PROCESSES.map(p => ({ value: p, label: p })) } },
  { id: 'util', label: { ko: '가동률(%)', en: 'Utilization (%)' }, spec: { kind: 'number' } },
  { id: 'id', label: { ko: '설비', en: 'Equipment' }, spec: { kind: 'text' } },
];

function Line({ initial = [], scope }: { initial?: ColumnFilter[]; scope?: boolean }) {
  const [filters, setFilters] = useState<ColumnFilter[]>(initial);
  return <FilterLine fields={FIELDS} filters={filters} onChange={setFilters} {...(scope ? { scopeLabel: { ko: '이 패널만', en: 'This panel only' } } : {})} />;
}

/** 표 없이 쓰는 표 필터 줄(차트 패널 등). 고정 필드 버튼이 칩이 되고, «+ 필터»·모두 지우기·편집기·상한은 표의 줄과 같다. 조건이 무엇을 거르는지는 소비자가 정한다. */
const meta = {
  title: '조회·필터/FilterLine',
  component: FilterLine,
  decorators: [Story => <div className="w-[720px]"><Story /></div>],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/filters/FilterLine.tsx',
    page: guidedPage([['docs/contract/components.md', 'It is controlled: every gesture calls'], ['docs/contract/components.md', 'It knows no table or chart']]),
  } },
  render: () => <Line />,
} satisfies Meta<typeof FilterLine>;
export default meta;
type Story = StoryObj;

/** 조건 없음: 고정 필드 버튼과 «+ 필터». */
export const Empty: Story = {};
/** 조건 둘: 공정 = 증착, 가동률 85 미만. */
export const WithConditions: Story = { render: () => <Line initial={[{ id: 'process', op: 'in', value: ['증착'] }, { id: 'util', op: 'lt', value: 85 }]} /> };
/** `scopeLabel`: 조건 앞에 «이 패널만» 표식. */
export const Scoped: Story = { render: () => <Line scope initial={[{ id: 'util', op: 'lt', value: 85 }]} /> };
