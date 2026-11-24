import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AuditEvent } from '@ap/contracts';
import { AuditTimeline, Panel, PlatformPage } from '@ap/components';
import { FieldList, FieldRow, ListToolbar, ObjectRow, SeverityIndicator, StatusBadge, UserChip } from '@ap/ui';
import { Frame, templatePage } from './assembly';

const QUEUE = [['VOC-311', 'EQ-0207 진공 알람 반복', 'critical', '김민수'], ['VOC-309', 'EQ-0519 세정 대기 길어짐', 'high', '홍길동'], ['VOC-305', '식각 사이클타임 기준 문의', 'low', '이서연']] as const;
const voc = { type: 'voc', id: 'VOC-311', label: 'VOC-311', scopeId: 'fab1' };
const HISTORY: AuditEvent[] = [
  { id: 'v2', at: '2026-11-13T14:40:00+09:00', actor: 'u2', actorLabel: '김민수', action: 'update', source: 'user', target: voc, changes: { 상태: ['접수', '처리 중'] } },
  { id: 'v1', at: '2026-11-13T11:02:00+09:00', actor: 'u1', actorLabel: '홍길동', action: 'update', source: 'user', target: voc, changes: { 담당: [null, '김민수'] }, reason: '증착 설비 담당' },
];

/** Workflow(layout.md §12.5): 상태 전이가 있는 객체를 큐에서 골라 처리한다. 공통 layout 부품도 검증 메뉴도 아직 없어 목록·상세 부품을 직접 놓는다. */
const meta = {
  title: '템플릿/Workflow',
  component: PlatformPage,
  parameters: { layout: 'fullscreen', docs: { page: templatePage('12.5 Workflow', 'Workflow', {
    'Queue/List': 'Panel + ObjectRow(severity 띠 · 담당 · 상태 배지)',
    'Status/Priority/Owner Filter': 'ListToolbar 탭(상태별 건수)',
    'Detail': 'Panel + FieldList · FieldRow, SeverityIndicator · StatusBadge · UserChip',
    'Timeline': 'Panel + AuditTimeline(상태 전이)',
    'Comments': 'Panel + UserChip과 본문 문단',
    'Related Context': 'Panel + ObjectRow(관련 설비·분석 화면)',
  }) } },
} satisfies Meta<typeof PlatformPage>;
export default meta;

/** 1440px 설비 VOC 처리: 상태 탭이 있는 큐, VOC-311의 상세·전이 이력·댓글·관련 맥락. */
export const VocQueue: StoryObj = {
  render: () => <Frame><PlatformPage title="설비 VOC" description="접수된 설비 VOC를 담당자에게 넘기고 처리 상태를 바꾼다.">
    <div className="grid grid-cols-[420px_1fr] items-start gap-3">
      <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
        <ListToolbar tabsAriaLabel="처리 상태" activeTab="open" tabs={[{ value: 'open', label: '처리 중', badgeCount: 3 }, { value: 'new', label: '접수', badgeCount: 5 }, { value: 'done', label: '완료', badgeCount: 41 }]} />
        {QUEUE.map(([id, title, severity, owner]) => <ObjectRow key={id} id={id} title={title} severity={severity} meta={`담당 ${owner}`} selected={id === 'VOC-311'} onClick={() => {}} />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Panel title="VOC-311 EQ-0207 진공 알람 반복"><FieldList>
          <FieldRow layout="detail" label="상태"><StatusBadge tone="info" dot>처리 중</StatusBadge></FieldRow>
          <FieldRow layout="detail" label="우선순위"><SeverityIndicator severity="critical" /></FieldRow>
          <FieldRow layout="detail" label="담당"><UserChip user={{ display_name: '김민수' }} size="sm" /></FieldRow>
        </FieldList></Panel>
        <Panel title="관련 맥락" bodyClassName="px-0 pb-2">
          <ObjectRow id="EQ-0207" title="증착 설비" meta="알람 9건" />
          <ObjectRow id="ANALYSIS" title="공정 가동 분석" meta="11-06 – 11-07 증착 미측정" />
        </Panel>
        <Panel title="전이 이력"><AuditTimeline events={HISTORY} /></Panel>
        <Panel title="댓글"><div className="space-y-3 text-sm">
          <div><UserChip user={{ display_name: '김민수' }} size="sm" sub="11-13 15:22" /><p className="mt-1">진공 펌프 교체 일정 잡았습니다. 11-15 오전 정지 예정.</p></div>
          <div><UserChip user={{ display_name: '홍길동' }} size="sm" sub="11-13 16:05" /><p className="mt-1">정지 시간은 계획 정지로 등록해 주세요.</p></div>
        </div></Panel>
      </div>
    </div>
  </PlatformPage></Frame>,
};
