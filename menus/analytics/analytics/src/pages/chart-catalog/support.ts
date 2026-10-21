import type { CatalogKind } from '../../endpoints';

type Label = { ko: string; en: string };
export const kindLabels: Record<CatalogKind, Label> = {
  topNBar: { ko: 'TopN 막대', en: 'TopN bar' }, lane: { ko: 'Lane 시간선', en: 'Lane timeline' },
  line: { ko: '선', en: 'Line' }, bar: { ko: '막대', en: 'Bar' }, heatmap: { ko: '히트맵', en: 'Heatmap' },
  donut: { ko: '도넛', en: 'Donut' }, scatter: { ko: '산점도', en: 'Scatter' },
  boxPlot: { ko: '상자그림', en: 'Box plot' }, pareto: { ko: '파레토', en: 'Pareto' },
};
export const statusLabels = {
  supported: { ko: '지원', en: 'Supported' }, conditional: { ko: '조건부', en: 'Conditional' }, unsupported: { ko: '미지원', en: 'Unsupported' },
};
export type SupportCell = { id: string; label: Label; status: keyof typeof statusLabels; reason: Label; reference: string };
type Features = { compare?: boolean; annotate?: boolean; export?: boolean };
const noReason: Label = { ko: '', en: '' };
/** The only capability table: tabs and support rows derive from this projection of 06 §16. */
export function supportFor(kind: CatalogKind, features: Features | undefined): SupportCell[] {
  const frame = kind === 'line' || kind === 'bar';
  const lane = kind === 'lane';
  const cell = (id: string, label: Label, status: SupportCell['status'], reason = noReason): SupportCell => ({ id, label, status, reason, reference: '06 §16' });
  const unavailable = { ko: '이 종류의 차트 계약에서 제공하지 않음', en: 'Not provided by this chart kind' };
  const featureOff = { ko: '메뉴 기능이 꺼져 있음', en: 'Disabled by the menu features' };
  return [
    cell('zoom', { ko: 'Zoom', en: 'Zoom' }, frame || lane ? 'supported' : 'unsupported', frame || lane ? noReason : unavailable),
    cell('selection', { ko: 'Brush·선택', en: 'Brush / selection' }, 'supported', lane ? { ko: '클릭·방향키·Enter로 구간 선택, Escape로 해제', en: 'Click or arrows/Enter to select; Escape to clear' } : frame
      ? { ko: '구간 끌기·키보드 시간 입력', en: 'Drag a range or use time inputs' }
      : kind === 'donut' || kind === 'boxPlot'
        ? { ko: '클릭·표 체크박스로 한 항목 선택', en: 'Select one item by click or table checkbox' }
        : { ko: '클릭·표 체크박스로 다중 선택', en: 'Select multiple items by click or table checkboxes' }),
    cell('reset', { ko: 'Reset', en: 'Reset' }, 'supported'),
    cell('compare', { ko: 'Compare', en: 'Compare' }, frame && features?.compare ? 'supported' : 'unsupported', frame ? features?.compare ? { ko: '이전 동일 기간 시리즈 제공', en: 'Previous equal-period series supplied' } : featureOff : unavailable),
    cell('annotate', { ko: 'Annotate', en: 'Annotate' }, frame && features?.annotate ? 'conditional' : 'unsupported', frame ? features?.annotate ? { ko: 'Scope·구간 선택 후 주석 작성', en: 'Requires Scope and a selected range' } : featureOff : unavailable),
    cell('export', { ko: 'Export', en: 'Export' }, !lane && features?.export ? 'supported' : 'unsupported', lane ? unavailable : features?.export ? noReason : featureOff),
    cell('drill', { ko: 'Drill', en: 'Drill' }, frame || lane ? 'unsupported' : 'conditional', lane ? unavailable : frame
      ? { ko: '차트 드릴 계약 전(#541)', en: 'Awaiting the chart drill contract (#541)' }
      : { ko: '단일 실제 항목의 요약·표 상세 버튼, 기타·미분류 제외', en: 'Details in summary/table for one real target; excludes Other/Unclassified' }),
    cell('table', { ko: '표로 보기', en: 'Show as table' }, lane ? 'unsupported' : 'supported', lane ? { ko: '방향키 탐색과 텍스트 요약 제공', en: 'Arrow navigation and text summaries provided' } : noReason),
  ];
}
export function supportCounts(row: SupportCell[]) {
  return { supported: row.filter(cell => cell.status === 'supported').length, conditional: row.filter(cell => cell.status === 'conditional').length, unsupported: row.filter(cell => cell.status === 'unsupported').length };
}
