import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActiveFilterBar, ListFilterButton, ListSortButton } from '@ap/ui';
import { PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

const CATEGORIES = [
  { key: 'process', label: '공정', options: PROCESSES.map(p => ({ value: p, label: p })) },
  { key: 'state', label: '상태', options: [{ value: 'run', label: '가동' }, { value: 'idle', label: '대기' }, { value: 'stop', label: '정지' }] },
];
const SORTS = [{ value: 'id', label: '설비 번호순' }, { value: 'util', label: '가동률 낮은 순' }, { value: 'alarms', label: '알람 많은 순' }];
const labelOf = (key: string, value: string) => CATEGORIES.find(c => c.key === key)!.options.find(o => o.value === value)!.label;

/** 목록 툴바의 거르기·정렬 버튼과, 적용된 필터를 칩으로 보이고 하나씩 지우는 `ActiveFilterBar`. 셋 다 값은 화면이 가진다. */
const meta = {
  title: '표 데이터/필터·정렬 버튼',
  component: ListFilterButton,
  args: { categories: CATEGORIES, values: { process: ['식각'], state: ['stop'] }, onChange: () => {} },
  render: function Render(args) {
    const [values, setValues] = useState(args.values);
    const [sort, setSort] = useState('util');
    const items = Object.entries(values).flatMap(([key, vs]) => vs.map(v => ({ key: `${key}:${v}`, label: labelOf(key, v),
      onRemove: () => setValues(cur => { const next = { ...cur, [key]: cur[key]!.filter(x => x !== v) }; if (!next[key]!.length) delete next[key]; return next; }) })));
    return <div className="flex w-[640px] flex-col gap-3">
      <div className="flex gap-2"><ListFilterButton {...args} values={values} onChange={setValues} />
        <ListSortButton options={SORTS} value={sort} defaultValue="id" onChange={setSort} /></div>
      <ActiveFilterBar items={items} onClearAll={() => setValues({})} />
    </div>;
  },
  parameters: {
    docs: {
      subtitle: '@ap/ui · packages/sdk/ui/src/toolbar/ListFilterButton.tsx · ListSortButton.tsx · ActiveFilterBar.tsx',
      page: guidedPage(),
    },
  },
} satisfies Meta<typeof ListFilterButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 필터 둘을 건 상태: 버튼에 수가 붙고, 정렬이 기본값이 아니면 버튼에 고른 정렬이 붙는다. */
export const Applied: Story = {};

/** 아무것도 걸지 않은 상태: 적용된 필터 줄은 그리지 않는다. */
export const Empty: Story = { args: { values: {} } };
