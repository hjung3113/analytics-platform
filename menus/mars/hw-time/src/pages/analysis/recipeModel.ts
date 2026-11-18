/// <reference path="./recipeRaw.d.ts" />
import type { Text } from '@ap/contracts';
import type { RegisteredPanel } from '@ap/kernel';
import { panelRecipe as sdkPanelRecipe, type PanelRecipe } from '@ap/components';
import { manifests } from '../../index';
import { HW_TIME_NEW_PANEL_MESSAGES as N } from '../../messages';
import workspaceSource from './AnalysisWorkspace.tsx?raw';
import additionalSource from './AdditionalPanels.tsx?raw';
import runSource from './RunPanel.tsx?raw';
import trendChartSource from './RunTrendChart.tsx?raw';
import tableSource from '../table/RawTablePanel.tsx?raw';
import newPanelsSource from './NewPanels.tsx?raw';
import distributionSource from './DistributionPanel.tsx?raw';
import declarationSource from '../../panels.ts?raw';
import type { HwTimePanelDeclaration } from '../../panels';

/** Key → words. A key glossary (one entry per input key), not copy per panel. */
const PAGE_LABELS: Readonly<Record<string, Text>> = {
  verdict: N.verdict, date: N.date,
  moduleType: { ko: 'Module 타입', en: 'Module type' }, drillModule: { ko: '고른 Module', en: 'Chosen Module' }, drillMotion: { ko: '고른 Motion', en: 'Chosen Motion' },
  trend: { ko: '추세 대상', en: 'Trend target' }, module: { ko: '체크한 Module', en: 'Checked Modules' }, motion: { ko: '체크한 Motion', en: 'Checked Motions' },
  row: { ko: '강조한 행', en: 'Highlighted row' }, focus: { ko: '초점 행', en: 'Focused row' }, page: { ko: '표 페이지', en: 'Table page' }, sort: { ko: '표 정렬', en: 'Table sort' },
  barsSort: { ko: '막대 정렬', en: 'Bar order' }, barsGroup: { ko: '막대 묶음', en: 'Bar grouping' }, barsMinMax: { ko: '최소·최대 표시', en: 'Min/max' }, align: { ko: '시작 맞춤', en: 'Align starts' },
  step4: { ko: '4단계 화면', en: 'Step 4' }, scopeId: { ko: 'Scope', en: 'Scope' },
};
const GRAIN_LABELS: Readonly<Record<string, Text>> = {
  equipmentDay: { ko: '설비·날짜 통계', en: 'Equipment/day stats' }, auditEvent: { ko: '변경 이력 한 건', en: 'One audit event' },
  matrixStat: { ko: '설비×Module 통계', en: 'Equipment × Module stats' }, dailyStat: { ko: '일 통계', en: 'Daily stats' }, run: { ko: '실행 한 건', en: 'One run' },
  motionStat: { ko: 'Motion 통계', en: 'Motion stats' }, rootAggregate: { ko: '원본 행 집계', en: 'Raw row aggregate' },
};
const ACTION_LABELS: Readonly<Record<string, Text>> = {
  verdict: N.verdict, date: N.date,
  drill: { ko: '단계 이동', en: 'Drill' }, highlight: { ko: '같이 강조', en: 'Highlight' }, page: { ko: '페이지', en: 'Page' }, sort: { ko: '정렬', en: 'Sort' },
};

const sources = { workspace: ['AnalysisWorkspace.tsx', workspaceSource], additional: ['AdditionalPanels.tsx', additionalSource], run: ['RunPanel.tsx', runSource], trendChart: ['RunTrendChart.tsx', trendChartSource], table: ['RawTablePanel.tsx', tableSource], newPanels: ['NewPanels.tsx', newPanelsSource], distribution: ['DistributionPanel.tsx', distributionSource] } as const;
/** Which menu files hold the panel's code. Shared files are named whole, not a per-panel implementation total. */
const SOURCE_OF: Readonly<Record<string, readonly (keyof typeof sources)[]>> = {
  heatmap: ['workspace'], trend: ['additional', 'run', 'trendChart'], scatter: ['additional', 'run'], motionTable: ['additional'], moduleMotions: ['workspace'], table: ['table'], distribution: ['distribution'], donut: ['workspace', 'newPanels'], pareto: ['workspace', 'newPanels'], equipmentDays: ['newPanels'], boundHistory: ['newPanels'],
};
const codeLines = (source: string) => source.split(/\r?\n/).filter(line => line.trim() !== '').length;
/** The declaration's own lines: from `<id>: {` to the line before the next panel entry. */
function declarationLines(id: string): number {
  const lines = declarationSource.split(/\r?\n/);
  const start = lines.findIndex(line => line.trimStart().startsWith(`${id}: {`));
  if (start < 0) return 0;
  let end = start + 1;
  while (end < lines.length && !/^\s{2}[a-zA-Z]+: \{/.test(lines[end]!) && !lines[end]!.startsWith('}')) end += 1;
  return lines.slice(start, end).filter(line => line.trim() !== '').length;
}

/** What the panel draws, as a reader names it; the SDK piece that draws it stays in `pieces`. */
const SHAPE_LABELS: Readonly<Record<string, Text>> = {
  heatmap: { ko: '히트맵', en: 'Heatmap' }, line: { ko: '선 차트', en: 'Line chart' }, scatter: { ko: '산점도', en: 'Scatter plot' },
  histogram: { ko: '히스토그램', en: 'Histogram' }, donut: { ko: '도넛 차트', en: 'Donut chart' }, pareto: { ko: '파레토 차트', en: 'Pareto chart' },
  audit: { ko: '변경 이력', en: 'Audit timeline' }, table: { ko: '표', en: 'Table' }, 'bar-horizontal': { ko: '가로 막대', en: 'Horizontal bars' },
};

/** HW Time's words and code counts on the SDK recipe of a registered panel (#2471). */
export function panelRecipe(panel: RegisteredPanel | undefined, context: Readonly<Record<string, unknown>>, options: { primary: boolean }): PanelRecipe | null {
  if (!panel || panel.menuId !== manifests[0]!.id) return null;
  const own = panel as RegisteredPanel & Pick<HwTimePanelDeclaration, 'kind' | 'csvExport'>;
  return sdkPanelRecipe({
    panel, menu: manifests[0]!, context,
    host: { add: true, pin: true, hide: !options.primary, layout: true, maximize: true, range: ['line', 'bar-horizontal', 'heatmap', 'scatter'].includes(own.kind ?? ''), csv: own.csvExport === true },
    labels: { keys: PAGE_LABELS, grains: GRAIN_LABELS, actions: ACTION_LABELS },
    ...(SHAPE_LABELS[own.kind ?? ''] ? { shape: SHAPE_LABELS[own.kind ?? '']! } : {}),
    code: { declaration: declarationLines(panel.id), files: (SOURCE_OF[panel.id] ?? []).map(key => ({ name: sources[key][0], lines: codeLines(sources[key][1]) })) },
  });
}
