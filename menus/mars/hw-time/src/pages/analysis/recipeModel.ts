/// <reference path="./recipeRaw.d.ts" />
import type { Text } from '@ap/contracts';
import { CONTEXT_LABELS } from '@ap/kernel';
import { manifests } from '../../index';
import { HW_TIME_NEW_PANEL_MESSAGES as N } from '../../messages';
import workspaceSource from './AnalysisWorkspace.tsx?raw';
import additionalSource from './AdditionalPanels.tsx?raw';
import runSource from './RunPanel.tsx?raw';
import tableSource from '../table/RawTablePanel.tsx?raw';
import newPanelsSource from './NewPanels.tsx?raw';
import distributionSource from './DistributionPanel.tsx?raw';
import declarationSource from './panelDeclaration.ts?raw';
import { disabledReason, panelDeclarations, type PanelDeclaration } from './panelDeclaration';

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
export const labelOf = (key: string): Text => (key in CONTEXT_LABELS ? CONTEXT_LABELS[key as keyof typeof CONTEXT_LABELS] : PAGE_LABELS[key]) ?? { ko: key, en: key };

const sources = { workspace: ['AnalysisWorkspace.tsx', workspaceSource], additional: ['AdditionalPanels.tsx', additionalSource], run: ['RunPanel.tsx', runSource], table: ['RawTablePanel.tsx', tableSource], newPanels: ['NewPanels.tsx', newPanelsSource], distribution: ['DistributionPanel.tsx', distributionSource] } as const;
/** Which menu files hold the panel's code. Shared files are named whole, not a per-panel implementation total. */
const SOURCE_OF: Readonly<Record<string, readonly (keyof typeof sources)[]>> = {
  heatmap: ['workspace'], trend: ['additional', 'run'], scatter: ['additional', 'run'], motionTable: ['additional'], moduleMotions: ['workspace'], table: ['table'], distribution: ['distribution'], donut: ['workspace', 'newPanels'], pareto: ['workspace', 'newPanels'], equipmentDays: ['newPanels'], boundHistory: ['newPanels'],
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

export type PlatformFeature = { id: string; label: Text; state: 'on' | 'off' | 'unknown'; note?: Text };
/** What the panel draws, as a reader names it; the SDK piece that draws it stays in `pieces`. */
const SHAPE_LABELS: Readonly<Record<string, Text>> = {
  heatmap: { ko: '히트맵', en: 'Heatmap' }, line: { ko: '선 차트', en: 'Line chart' }, scatter: { ko: '산점도', en: 'Scatter plot' },
  histogram: { ko: '히스토그램', en: 'Histogram' }, donut: { ko: '도넛 차트', en: 'Donut chart' }, pareto: { ko: '파레토 차트', en: 'Pareto chart' },
  audit: { ko: '변경 이력', en: 'Audit timeline' }, table: { ko: '표', en: 'Table' }, 'bar-horizontal': { ko: '가로 막대', en: 'Horizontal bars' },
};
export type Recipe = {
  declaration: PanelDeclaration;
  shape: Text;
  data: { endpoints: readonly string[]; grain: Text; inputs: readonly string[] };
  pieces: readonly string[];
  follows: { inputs: readonly string[]; outputs: readonly { key: string; action: Text }[] };
  condition: { declared: Text | null; now: Text | undefined };
  code: { declaration: number; files: readonly { name: string; lines: number }[] };
  platform: readonly PlatformFeature[];
};

export function panelRecipe(id: string, context: Readonly<Record<string, unknown>>, options: { primary: boolean }): Recipe | null {
  if (!Object.hasOwn(panelDeclarations, id)) return null;
  const declaration: PanelDeclaration = panelDeclarations[id as keyof typeof panelDeclarations];
  const manifest = manifests[0]!;
  const pieces = declaration.pieces ?? [];
  const chart = pieces.some(piece => piece === 'AnalysisChart' || piece.startsWith('AnalysisChart:') || piece === 'AnalysisChartFrame');
  const table = pieces.includes('PlatformDataTable');
  const range = ['line', 'bar-horizontal', 'heatmap', 'scatter'].includes(declaration.kind ?? '');
  const queryKeys = [...(declaration.queryInputs.context ?? []), ...(declaration.queryInputs.page ?? []).map(input => input.key)];
  const required = (declaration.queryInputs.page ?? []).filter(input => input.required).map(input => labelOf(input.key));
  const declared = declaration.availability?.disabledReason
    ?? (required.length ? { ko: `${required.map(label => label.ko).join(', ')} 필요`, en: `Needs ${required.map(label => label.en).join(', ')}` } : null);
  const on = (value: boolean) => value ? 'on' as const : 'off' as const;
  return {
    declaration,
    shape: SHAPE_LABELS[declaration.kind ?? ''] ?? { ko: '—', en: '—' },
    data: { endpoints: declaration.endpoints, grain: GRAIN_LABELS[declaration.grain] ?? { ko: declaration.grain, en: declaration.grain }, inputs: queryKeys },
    pieces,
    follows: { inputs: (declaration.displayInputs.page ?? []).map(input => input.key), outputs: declaration.outputs.map(output => ({ key: output.key, action: ACTION_LABELS[output.action] ?? { ko: output.action, en: output.action } })) },
    condition: { declared, now: disabledReason(declaration, context, PAGE_LABELS) },
    code: { declaration: declarationLines(id), files: (SOURCE_OF[id] ?? []).map(key => ({ name: sources[key][0], lines: codeLines(sources[key][1]) })) },
    platform: [
      { id: 'add', label: { ko: '패널 추가', en: 'Add panel' }, state: 'on' },
      { id: 'pin', label: { ko: '고정', en: 'Pin' }, state: 'on' },
      { id: 'hide', label: { ko: '숨기기', en: 'Hide' }, state: on(!options.primary) },
      { id: 'layout', label: { ko: '배치 저장', en: 'Saved layout' }, state: 'on' },
      { id: 'maximize', label: { ko: '크게 보기', en: 'Maximize' }, state: 'on' },
      { id: 'range', label: { ko: '확대·구간', en: 'Zoom & range' }, state: on(range) },
      { id: 'annotate', label: { ko: '주석', en: 'Annotate' }, state: on(chart && manifest.features.annotate === true), note: chart && manifest.features.annotate !== true ? { ko: '메뉴가 끔', en: 'Off in this menu' } : undefined },
      { id: 'image', label: { ko: '이미지', en: 'Image' }, state: 'off', note: { ko: '메뉴가 안 켬(SDK 옵션 있음)', en: 'Not turned on by this menu (SDK option exists)' } },
      { id: 'csv', label: { ko: 'CSV', en: 'CSV' }, state: on(manifest.features.export === true && (chart || table)) },
      { id: 'states', label: { ko: '빈·오류 상태', en: 'Empty & error states' }, state: on(pieces.includes('QueryView')) },
      { id: 'link', label: { ko: '공유 링크', en: 'Share link' }, state: 'on' },
      { id: 'permission', label: { ko: '권한', en: 'Permission' }, state: 'on', note: { ko: String(manifest.permission), en: String(manifest.permission) } },
      { id: 'audit', label: { ko: '감사', en: 'Audit' }, state: 'unknown', note: { ko: '공통 경로, 이 패널 기록은 확인 안 함', en: 'Shared path, not checked per panel' } },
    ],
  };
}
