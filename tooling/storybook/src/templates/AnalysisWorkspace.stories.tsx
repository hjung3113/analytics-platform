import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Gauge, Timer } from 'lucide-react';
import { AnalysisChartFrame, AnalysisLayout, DataTrustIndicator, PlatformDataTable, PlatformPage, StatCard, type ChartSeries } from '@ap/components';
import { COLUMNS, EQUIPMENT, PROCESSES, TRUST, type Eq } from '../equipment';
import { Frame, templatePage } from './assembly';

// Synthetic series (no real data): three processes over 14 days.
const days = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00`);
const wave = (base: number, seed: number) => days.map((d, i) => [d, Math.round((base + 4 * Math.sin((i + seed) / 2.1)) * 10) / 10] as [string, number]);
const UTIL: ChartSeries[] = PROCESSES.map((name, i) => ({ id: name, name, color: `chart-series-${i + 1}` as ChartSeries['color'], unit: '%', points: wave([88, 81, 90][i]!, i * 2) }));
const avg = (p: string) => Math.round(EQUIPMENT.filter(e => e.process === p).reduce((s, e) => s + e.cycle, 0) / EQUIPMENT.filter(e => e.process === p).length);
const CYCLE: ChartSeries[] = [{ id: 'cycle', name: '평균 사이클타임', color: 'chart-series-1', unit: '초', kind: 'bar', points: PROCESSES.map(p => [p, avg(p)]) }];

/** Analysis Workspace(layout.md §12.2): 조건 → KPI → 차트 → 분해 표를 한 화면에 둔다. `AnalysisLayout`이 KPI·차트·분해 표 자리를 잡는다. */
const meta = {
  title: '템플릿/Analysis Workspace',
  component: AnalysisLayout,
  parameters: { layout: 'fullscreen', docs: { page: templatePage('12.2 Analysis Workspace', 'Analysis Workspace', {
    'Page Header': 'PlatformPage — title · description',
    'Global Context': '셸의 Context 바(§8 셸 슬롯). Storybook에는 셸이 없어 그리지 않는다',
    'KPI Summary': 'AnalysisLayout kpi ← StatCard 셋',
    'Primary Chart': 'AnalysisLayout charts ← AnalysisChartFrame 둘(2열)',
    'Selection / Annotation': 'AnalysisChartFrame 안의 선택·주석(«데이터 시각화/Chart Frame» 문서)',
    'Breakdown Table': 'AnalysisLayout breakdown ← PlatformDataTable',
    'Data Trust': 'PlatformPage dataTrustSummary ← DataTrustIndicator(응답 Trust)',
  }) } },
} satisfies Meta<typeof AnalysisLayout>;
export default meta;

/** 1440px 폭의 공정 가동 분석 화면. KPI 띠, 차트 두 개, 설비별 분해 표. */
export const ProcessUtilization: StoryObj = {
  render: () => <Frame><PlatformPage title="공정 가동 분석" description="공정별 가동률과 사이클타임을 비교하고 설비 단위로 나눠 본다." dataTrustSummary={<DataTrustIndicator trust={TRUST} assessments={[]} />}>
    <AnalysisLayout
      kpi={{ id: 'kpi', title: '가동 요약', node: <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Gauge} chip="blue" label="평균 가동률" value="86.2" unit="%" delta={{ value: '+1.8%p', direction: 'up', good: true }} caption="11-01 – 11-14" />
        <StatCard icon={Timer} chip="teal" label="평균 사이클타임" value="139" unit="초" caption="공정 3개 평균" />
        <StatCard icon={Bell} chip="blue" label="알람" value="27" unit="건" caption="증착 15건" />
      </div> }}
      charts={[
        { id: 'trend', title: '공정별 일 가동률', node: <AnalysisChartFrame chartId="sb-trend" title="공정별 일 가동률" unit="%" series={UTIL} xType="time" /> },
        { id: 'cycle', title: '공정별 사이클타임', node: <AnalysisChartFrame chartId="sb-cycle" title="공정별 사이클타임" unit="초" series={CYCLE} xType="category" /> },
      ]}
      breakdown={{ id: 'breakdown', title: '설비별 분해', node: <PlatformDataTable<Eq> title="설비별 분해" ariaLabel="설비별 분해 표" columns={COLUMNS} rows={EQUIPMENT} getRowId={e => e.id} preferenceKey="storybook:breakdown:v1" /> }}
    />
  </PlatformPage></Frame>,
};
