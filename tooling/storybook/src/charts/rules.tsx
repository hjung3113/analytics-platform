import type { CSSProperties } from 'react';
import { Unstyled } from '@storybook/addon-docs/blocks';
import { docs } from 'virtual:design-sources';
import { SAMPLE } from '../foundations/tokens';
import { NO_RULE, quote, type Quote } from '../guidance';

// Every rule on 데이터 시각화/개요 is a sentence of the source documents, read at build time; NO_RULE where they hold none.
const CHART = 'docs/contract/chart.md';
const SPEC = 'docs/adr/0058-analysis-chart-spec-union.md';
const TOPN = 'docs/adr/0064-topn-bar-and-lane-timeline.md';
const TRACK = 'docs/adr/0121-ordered-interval-track-sdk-piece.md';
const CHOOSER: [chart: string, piece: string, use: Quote[], avoid: Quote[]][] = [
  ['선·막대 (시간축·범주축)', 'AnalysisChartFrame', [['DESIGN.md', '변화·분포는 차트']], []],
  ['누적·100% 누적', 'AnalysisChartFrame stackMode', [[CHART, '`stack`은 `canClientSum`이 허용하는 측정']], [[CHART, '집계 선언이 없거나 더할 수 없으면 쌓지 않고']]],
  ['가로 범주 막대', 'AnalysisChartFrame orientation="horizontal"', [[CHART, '드릴이 가능한 가로 막대는']], []],
  ['순위 막대', 'AnalysisChart topNBar', [[CHART, '단일 측정값 순위에 상위 N 자르기']], [[TOPN, '기타·누적률과 단순 순위의 의미가 섞인다']]],
  ['파레토', 'AnalysisChart pareto', [], [[TOPN, '기타·누적률과 단순 순위의 의미가 섞인다']]],
  ['히트맵', 'AnalysisChart heatmap', [[SPEC, '히트맵은 두 범주축의 셀']], [[SPEC, 'threshold는 실제 승인된 판정에만 쓰고']]],
  ['도넛', 'AnalysisChart donut', [[SPEC, '도넛은 분모가 있는 구성비를 받는다']], [[SPEC, '도넛의 `maxSlices`는 2–5로 제한한다']]],
  ['산점도', 'AnalysisChart scatter', [], []],
  ['상자 그림', 'AnalysisChart boxPlot', [[CHART, 'boxPlot은 원자료 대신 호출자가 계산한 통계를 받으며']], []],
  ['히스토그램', 'AnalysisChart histogram', [], []],
  ['레인 시간선', 'LaneTimeline', [[TOPN, 'React 렌더 없이 수십만 구간을 다룰 수 있기']], [[TOPN, '기존 시간축 Frame을 대체하지 않는다']]],
  ['순서 트랙', 'OrderedIntervalTrack', [[TRACK, '위치는 소비자가 준 서수이고']], [[TRACK, '시간 축은 소비자가 명시했을 때만 쓴다']]],
];
// DESIGN.md token-table rows drawn with their live colors.
const COLOR_ROWS = ['`chart-series-1`', '`chart-status-good`', '`chart-no-data`', '`chart-selection-outline`', '`chart-grid`'];

function Quoted({ quotes }: { quotes: Quote[] }) {
  if (quotes.length === 0) return <span className="text-text-muted">{NO_RULE}</span>;
  return <>{quotes.map(q => <p key={q[1]} className={quote(q) ? undefined : 'text-text-danger'}>
    {quote(q) ?? `원문에서 사라진 문장: ${q[1]}`} <a className="t-caption text-text-muted" href={`https://github.com/hjung3113/analytics-platform/blob/main/${q[0]}`}>{q[0].replace(/^docs\/(adr\/\d+).*/, '$1')}</a>
  </p>)}</>;
}

/** Chart → 쓰는 곳 → 쓰지 않는 곳, each cell quoted from DESIGN.md, chart.md §16 or the deciding ADR. */
export function ChartChooser() {
  return <Unstyled><table className="w-full border-collapse text-sm">
    <thead><tr className="border-b border-border-subtle text-left t-card-title">{['차트', '부품', '쓰는 곳', '쓰지 않는 곳'].map(h => <th key={h} className="py-2 pr-4">{h}</th>)}</tr></thead>
    <tbody>{CHOOSER.map(([chart, piece, use, avoid]) => <tr key={chart} className="border-b border-border-row align-top">
      <td className="py-2 pr-4 font-semibold">{chart}</td><td className="py-2 pr-4 t-mono">{piece}</td>
      <td className="w-2/5 py-2 pr-4"><Quoted quotes={use} /></td><td className="w-1/4 py-2"><Quoted quotes={avoid} /></td>
    </tr>)}</tbody>
  </table></Unstyled>;
}

/** The 종류별 상호작용 table of chart.md §16, as the document has it. */
export function InteractionTable() {
  const lines = (docs[CHART].split('### 종류별 상호작용')[1] ?? '').split('\n');
  const start = lines.findIndex(line => line.startsWith('|'));
  const end = lines.findIndex((line, i) => i > start && !line.startsWith('|'));
  const [head, ...rows] = lines.slice(start, end).filter(line => !line.startsWith('| ---')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim().replace(/`/g, '')));
  return <Unstyled><table className="w-full border-collapse text-xs">
    <thead><tr className="border-b border-border-subtle text-left">{head?.map(h => <th key={h} className="py-2 pr-2">{h}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row[0]} className="border-b border-border-row align-top">{row.map((cell, i) => <td key={i} className={i === 0 ? 'py-2 pr-2 font-semibold' : 'py-2 pr-2'}>{cell}</td>)}</tr>)}</tbody>
  </table></Unstyled>;
}

/** Chart color rules: the DESIGN.md token rows with a live sample of each token (and the no-data hatch). */
export function ChartColors() {
  const rows = docs['DESIGN.md'].split('\n').filter(line => COLOR_ROWS.some(name => line.startsWith(`| ${name}`))).map(line => line.split('|').slice(1, 3).map(cell => cell.trim()));
  return <Unstyled><div className="flex flex-col">{rows.map(([names = '', role = '']) => <div key={names} className="flex items-center gap-4 border-b border-border-row py-2">
    <div className="flex w-56 shrink-0 gap-1">{[...names.matchAll(/`([\w-]+)`/g)].map(([, name]) => <span key={name} title={name}
      className={`size-8 rounded-md border border-border-subtle ${SAMPLE.color}`} style={{ '--sample': `var(--${name})` } as CSSProperties} />)}
      {names.includes('chart-no-data') && <span title="surface-hatched" className="surface-hatched size-8 rounded-md border border-border-subtle" />}</div>
    <div className="min-w-0 flex-1"><div className="t-mono text-text-primary">{names.replace(/`/g, '')}</div><div className="t-caption text-text-secondary">{role}</div></div>
  </div>)}</div></Unstyled>;
}
