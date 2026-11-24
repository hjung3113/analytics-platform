import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Gauge, Timer, Wrench } from 'lucide-react';
import { AnalysisChartFrame, DataTrustIndicator, Panel, PlatformPage, StatCard } from '@ap/components';
import { Button, ObjectRow, StatusBadge } from '@ap/ui';
import { EQUIPMENT, TRUST, UTIL_SERIES } from '../equipment';
import { Frame, templatePage } from './assembly';

const attention = [...EQUIPMENT].sort((a, b) => b.alarms - a.alarms).slice(0, 4);
const severityOf = (alarms: number) => (alarms >= 9 ? 'critical' : alarms >= 6 ? 'high' : 'medium');

/** Overview(layout.md §12.1): 상태를 요약하고 다음 행동으로 들어가는 첫 화면. 공통 layout 부품이 없어 `PlatformPage` 안에 구역 부품을 쌓는다. */
const meta = {
  title: '템플릿/Overview',
  component: PlatformPage,
  parameters: { layout: 'fullscreen', docs: { page: templatePage('12.1 Overview', 'Overview', {
    'Page Header': 'PlatformPage — title · description · primaryAction(Button)',
    'Global Context': '셸의 Context 바(§8 셸 슬롯). Storybook에는 셸이 없어 그리지 않는다',
    'Primary KPI / Summary': 'StatCard 넷(4열 grid)',
    'Main Trend or Status': 'AnalysisChartFrame 단독 카드(시간축 선, 증착 이틀 미측정)',
    'Attention List': 'Panel + ObjectRow(severity 띠 · 메타 · 오른쪽 값) + StatusBadge',
    'Data Trust': 'PlatformPage dataTrustSummary ← DataTrustIndicator(응답 Trust)',
  }) } },
} satisfies Meta<typeof PlatformPage>;
export default meta;

/** 1440px 공장 가동 현황: KPI 넷, 공정별 가동률 추이, 알람이 많은 설비 목록, 머리의 데이터 신뢰. */
export const FabStatus: StoryObj = {
  render: () => <Frame><PlatformPage title="가동 현황" description="공장 전체 가동 상태를 요약하고 먼저 볼 설비로 들어간다."
    primaryAction={<Button size="sm">알람 설비 보기</Button>} dataTrustSummary={<DataTrustIndicator trust={TRUST} assessments={[]} />}>
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={Gauge} chip="blue" label="평균 가동률" value="86.2" unit="%" delta={{ value: '+1.8%p', direction: 'up', good: true }} caption="11-01 – 11-14" />
        <StatCard icon={Timer} chip="teal" label="평균 사이클타임" value="139" unit="초" caption="공정 3개 평균" />
        <StatCard icon={Bell} chip="blue" label="알람" value="27" unit="건" delta={{ value: '+6건', direction: 'up', good: false }} caption="증착 15건" />
        <StatCard icon={Wrench} chip="teal" label="점검 필요" value="2" unit="대" caption="가동률 80% 미만" />
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <AnalysisChartFrame chartId="sb-ov-trend" title="공정별 일 가동률" unit="%" series={UTIL_SERIES} xType="time" />
        <Panel title="먼저 볼 설비" subtitle="알람 많은 순" bodyClassName="px-0 pb-2">
          {attention.map(e => <ObjectRow key={e.id} id={e.id} title={`${e.process} 설비`} severity={severityOf(e.alarms)} meta={`알람 ${e.alarms}건`}
            trailing={<span className="tabular text-sm">{e.util.toFixed(1)}%</span>} badges={e.util < 80 ? <StatusBadge tone="warning">점검 필요</StatusBadge> : undefined} onClick={() => {}} />)}
        </Panel>
      </div>
    </div>
  </PlatformPage></Frame>,
};
