import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { MatrixCell, MatrixColumn, MatrixNode } from '@ap/contracts';
import { MatrixToneLegend, TreeMatrix, type MatrixCellTone } from '@ap/components';
import { EQUIPMENT, HEAT_CELLS, PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

// Process → equipment × 6 days of utilization (synthetic). The server would flatten the visible tree and own the counts;
// here the story flattens it from the expanded set. A group's cell is its equipment average; EQ-0207 has no value on 11-04.
type Row = MatrixNode & { values: Record<string, number | null> };
const DAYS = [...new Set(HEAT_CELLS.map(c => c.x))].slice(0, 6);
const COLUMNS: MatrixColumn[] = [{ id: 'name', label: '공정 / 설비' }, ...DAYS.map(d => ({ id: d, label: d, width: 'compact' as const }))];
const util = (id: string) => Object.fromEntries(DAYS.map(d => [d, HEAT_CELLS.find(c => c.y === id && c.x === d)!.value]));
const mean = (rows: Record<string, number | null>[], d: string) => Math.round(rows.reduce((s, r) => s + (r[d] ?? 0), 0) / rows.filter(r => r[d] !== null).length);
function flatten(expanded: ReadonlySet<string>): Row[] {
  return PROCESSES.flatMap(p => {
    const leaves = EQUIPMENT.filter(e => e.process === p).map(e => ({ id: e.id, level: 1, kind: 'leaf' as const, hasChildren: false, expanded: false, label: e.id, values: util(e.id) }));
    const group: Row = { id: p, level: 0, kind: 'group', hasChildren: true, expanded: expanded.has(p), label: p, count: leaves.length, values: Object.fromEntries(DAYS.map(d => [d, mean(leaves.map(l => l.values), d)])) };
    return expanded.has(p) ? [group, ...leaves] : [group];
  });
}
// The tone's meaning is the consumer's (components.md): below the 85% target is danger, an unmeasured day is missing.
const tone = (row: Row, column: MatrixColumn): MatrixCellTone | undefined =>
  column.id === 'name' ? undefined : row.values[column.id] === null ? 'missing' : row.values[column.id]! < 85 ? 'danger' : undefined;
const LEGEND: Partial<Record<MatrixCellTone, string>> = { danger: '목표 85% 미만', missing: '미측정' };

function Matrix({ open = ['식각', '증착'] }: { open?: string[] }) {
  const [expanded, setExpanded] = useState(new Set(open));
  const [cell, setCell] = useState<MatrixCell | null>({ row: 'EQ-0207', column: '11-02' });
  const nodes = flatten(expanded);
  return <div className="flex h-[360px] w-full flex-col gap-2">
    <MatrixToneLegend labels={LEGEND} aria-label="셀 색 범례" />
    <TreeMatrix<Row> label="공정별 설비 일 가동률" nodes={nodes} columns={COLUMNS} identityColumn="name" offset={0} totalVisible={nodes.length} windowSize={nodes.length}
      renderCell={(row, column) => column.id === 'name' ? row.label : <span className="tabular ml-auto">{row.values[column.id] ?? '—'}</span>}
      cellTone={tone} valueOf={(row, column) => row.values[column.id] ?? null} onWindowChange={() => undefined}
      onToggle={id => setExpanded(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; })}
      selectedCell={cell} onSelectCell={setCell} fill />
  </div>;
}

/** 계층 행(공정 → 설비) × 평면 열(일)의 서버 윈도 행렬. 행 펼침·창 이동·셀 선택은 제어형이고, 서버가 평탄화한 보이는 트리와 합계를 준다. */
const meta = {
  title: '행렬/TreeMatrix',
  component: TreeMatrix,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/matrix/TreeMatrix.tsx',
    page: guidedPage(
      [['docs/contract/components.md', '색의 업무 의미와 색 외 표식·문구는 소비자 책임이다'], ['docs/contract/components.md', '수식키 없는 Enter는']],
      [['docs/contract/components.md', '브라우저가 받은 행으로 집계하지 않는다']],
    ),
  } },
  render: () => <Matrix />,
} satisfies Meta<typeof TreeMatrix>;
export default meta;
type Story = StoryObj;

/** 식각·증착을 펼치고 EQ-0207의 11-02 셀을 고른 상태. 11-04는 EQ-0207 미측정(빗금)이다. */
export const Expanded: Story = {};
/** 모두 접은 상태: 공정 행만 남고 셀은 설비 평균이다. */
export const Collapsed: Story = { render: () => <Matrix open={[]} /> };
