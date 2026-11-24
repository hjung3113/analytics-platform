import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PanelDeclaration } from '@ap/contracts';
import { useAnalysisSelectionInputs, useAnalysisSelectionOutput } from '@ap/kernel';
import { AnalysisChartFrame, AnalysisSelectionChipZone, PlatformDataTable, type ChartPoint, type ChartPointAction } from '@ap/components';
import { ALARM_SERIES, COLUMNS, EQUIPMENT, type Eq } from '../equipment';
import { guidedPage } from '../guidance';
import { platformDecorator } from '../platform';

// Two panels of the mock analysis menu (ADR-0175): the alarm chart declares the equipment value set as its `outputs` selection,
// the detail table reads that page key as a `filter` input. The key must also be repeated (a set) and reset with the global Context.
const KEY = 'alarmEquipment';
const PANELS: PanelDeclaration[] = [
  { id: 'alarms', title: { ko: '설비별 알람', en: 'Alarms by equipment' }, queryInputs: {}, displayInputs: {}, grain: 'equipment', endpoints: [],
    outputs: [{ key: KEY, action: 'select', selection: { dimension: 'equipmentId', shape: 'set', label: { ko: '설비', en: 'Equipment' } } }] },
  { id: 'detail', title: { ko: '설비 상세', en: 'Equipment detail' }, queryInputs: { page: [{ key: KEY, selection: 'filter' }] }, displayInputs: {}, outputs: [], grain: 'equipment', endpoints: [] },
];
// The table keeps four columns so it fits half the page.
const TABLE_COLUMNS = COLUMNS.filter(c => c.id !== 'cycle');
const selectionPage = (address = '/') => platformDecorator({ address, menu: { panels: PANELS, pageKeys: [KEY], repeatedPageKeys: [KEY], contextResetKeys: [KEY] } });

/** The menu side: the chart writes through `useAnalysisSelectionOutput`, the table reads `useAnalysisSelectionInputs().applied`. */
function SelectionPage() {
  const output = useAnalysisSelectionOutput('alarms', KEY);
  const picked = output.selection?.shape === 'set' ? output.selection.values : [];
  const filter = useAnalysisSelectionInputs('detail').applied.find(input => input.key === KEY)?.selection;
  const rows = filter?.shape === 'set' ? EQUIPMENT.filter(e => filter.values.includes(e.id)) : EQUIPMENT;
  // An explicit point action, never a plain click (DESIGN.md): pick a bar, then «지점 동작».
  const actions = ({ x }: ChartPoint): ChartPointAction[] => [picked.includes(x)
    ? { id: 'remove', label: `선택에서 빼기 · ${x}`, keepsFocus: true, onSelect: () => output.select(picked.length > 1 ? { shape: 'set', values: picked.filter(v => v !== x) } : null) }
    : { id: 'add', label: `선택에 더하기 · ${x}`, keepsFocus: true, onSelect: () => output.select({ shape: 'set', values: [...picked, x] }) }];
  return <div className="flex flex-col gap-3">
    <div className="flex h-10 items-center rounded-md border border-border-subtle px-3 text-sm text-text-secondary">조회 조건: 1공장 · 11-01 – 11-14<AnalysisSelectionChipZone /></div>
    <div className="grid grid-cols-2 gap-3">
      <AnalysisChartFrame chartId="sb-selection" title="설비별 알람" unit="건" xType="category" orientation="horizontal" rowPitch={28} series={ALARM_SERIES}
        pointActions={actions} highlightedValues={output.highlighted ? picked : []} />
      <div className="flex h-[440px] flex-col"><PlatformDataTable<Eq> title={filter ? `설비 상세 · 선택 적용 ${rows.length}대` : '설비 상세'} ariaLabel="설비 상세 표"
        columns={TABLE_COLUMNS} rows={rows} getRowId={e => e.id} preferenceKey="storybook:selection:v1" fill /></div>
    </div>
  </div>;
}

/**
 * 차트에서 고른 값이 같은 화면 다른 패널의 입력이 된다(ADR-0175). 패널이 `outputs`에 선언한 키로 값 묶음·범위를 메뉴 URL에 싣고,
 * 받는 패널은 그 키를 `filter`·`highlight`로 읽는다. 칩 줄(`AnalysisSelectionChipZone`)이 걸린 선택을 보이고 지운다. 칩에 마우스를 올리면 출처 막대가 점선으로 강조된다.
 */
const meta = {
  title: '데이터 시각화/분석 선택',
  component: AnalysisSelectionChipZone,
  parameters: { docs: {
    subtitle: '@ap/components AnalysisSelectionChipZone · @ap/kernel useAnalysisSelectionOutput·useAnalysisSelectionInputs · PanelDeclaration.outputs',
    page: guidedPage(
      [['docs/contract/chart.md', '선언한 분석 선택 출력은 메뉴 URL에 기록한다'], ['docs/contract/chart.md', '값을 받는 패널은 `filter` 또는 `highlight`를 선언한다'],
        ['docs/adr/0175-chart-selection-feeds-next-analysis.md', '선택은 페이지 안의 연결 패널에만 바로 걸린다']],
      [['docs/adr/0175-chart-selection-feeds-next-analysis.md', '은 URL에 싣지 않는다'], ['docs/adr/0175-chart-selection-feeds-next-analysis.md', '전역 기간과 설비 선택은 지금처럼'],
        ['DESIGN.md', '단순 chart click으로 조용히 조건을 바꾸지 않는다']],
    ),
  } },
  render: () => <SelectionPage />,
} satisfies Meta<typeof AnalysisSelectionChipZone>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 선택 전. 막대를 고르고 «지점 동작» → «선택에 더하기»를 누르면 칩이 생기고 오른쪽 표가 그 설비로 걸러진다. */
export const BeforeSelection: Story = { decorators: [selectionPage()] };
/** 공유 링크로 연 상태: 주소의 `alarmEquipment=EQ-0207&alarmEquipment=EQ-0519`가 칩과 표 필터로 되살아난다. 칩의 ×나 «모두 지우기»로 지운다. */
export const Selected: Story = { decorators: [selectionPage('/?alarmEquipment=EQ-0207&alarmEquipment=EQ-0519')] };
