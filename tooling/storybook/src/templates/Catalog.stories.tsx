import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AuditEvent } from '@ap/contracts';
import { AuditTimeline, Panel, PlatformPage } from '@ap/components';
import { Badge, FieldList, FieldRow, ObjectRow, ProgressMeter, UserChip } from '@ap/ui';
import { Frame, templatePage } from './assembly';

const METRICS = [['M-UTIL', '가동률', 'v3'], ['M-CYCLE', '사이클타임', 'v2'], ['M-MTBF', '평균 고장 간격', 'v1'], ['M-YIELD', '수율', 'v4']] as const;
const HISTORY: AuditEvent[] = [{ id: 'm1', at: '2026-10-01T09:00:00+09:00', actor: 'u1', actorLabel: '홍길동', action: 'update', source: 'user',
  target: { type: 'metric', id: 'M-UTIL', label: '가동률', scopeId: null }, changes: { 버전: ['v2', 'v3'], 분모: ['달력 시간', '계획 시간'] }, reason: '계획 정지 제외' }];

/** Catalog(layout.md §12.4): 정의·버전·사용처가 중요한 객체. 목록과 객체 한 쪽(구역 여섯)의 모양이며, 공통 layout 부품 없이 `Panel` 구역을 쌓는다. */
const meta = {
  title: '템플릿/Catalog',
  component: PlatformPage,
  parameters: { layout: 'fullscreen', docs: { page: templatePage('12.4 Catalog', 'Catalog', {
    'Catalog List': 'Panel + ObjectRow(선택된 지표는 선택 면과 막대)',
    'Definition Detail': 'Panel + FieldList · FieldRow(layout="detail")',
    'Version': 'Panel + FieldList, 현재 버전 Badge',
    'Ownership': 'Panel + UserChip(담당·검토)',
    'Coverage': 'Panel + ProgressMeter와 비율 숫자',
    'Usage / Dependency': 'Panel + ObjectRow(쓰는 메뉴·의존 지표)',
    'History': 'Panel + AuditTimeline',
  }) } },
} satisfies Meta<typeof PlatformPage>;
export default meta;

/** 1440px 지표 카탈로그: 왼쪽 지표 목록, 오른쪽 «가동률» 지표의 정의·버전·담당·커버리지·사용처·이력. */
export const MetricCatalog: StoryObj = {
  render: () => <Frame><PlatformPage title="지표 카탈로그" description="지표의 정의와 버전, 쓰는 곳을 한 쪽에서 본다.">
    <div className="grid grid-cols-[320px_1fr] items-start gap-3">
      <Panel title="지표" bodyClassName="px-0 pb-2">{METRICS.map(([id, name, version]) => <ObjectRow key={id} id={id} title={name} meta={version} selected={id === 'M-UTIL'} onClick={() => {}} />)}</Panel>
      <div className="grid grid-cols-3 gap-3">
        <Panel title="정의" className="col-span-2"><FieldList>
          <FieldRow layout="detail" label="계산식">가동 시간 ÷ 계획 시간 × 100</FieldRow>
          <FieldRow layout="detail" label="단위">%</FieldRow>
          <FieldRow layout="detail" label="집계">설비 → 공정 → 공장, 시간 가중 평균</FieldRow>
        </FieldList></Panel>
        <Panel title="버전"><FieldList>
          <FieldRow layout="detail" label="현재"><Badge>v3</Badge></FieldRow>
          <FieldRow layout="detail" label="적용 시작">2026-10-01</FieldRow>
        </FieldList></Panel>
        <Panel title="담당"><div className="space-y-2"><UserChip user={{ display_name: '홍길동' }} sub="정의 담당" /><UserChip user={{ display_name: '김민수' }} sub="검토" /></div></Panel>
        <Panel title="커버리지"><p className="tabular mb-2 text-sm">설비 412 / 425대 · 96.9%</p><ProgressMeter value={96.9} max={100} /></Panel>
        <Panel title="사용처" bodyClassName="px-0 pb-2">
          <ObjectRow id="MENU" title="공정 가동 분석" meta="메뉴" />
          <ObjectRow id="M-OEE" title="설비 종합 효율" meta="의존 지표" />
        </Panel>
        <Panel title="이력" className="col-span-3"><AuditTimeline events={HISTORY} /></Panel>
      </div>
    </div>
  </PlatformPage></Frame>,
};
