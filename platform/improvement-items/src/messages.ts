import type { Text } from '@ap/contracts';

export const IMPROVEMENT_ITEMS_MESSAGES = {

  // HomeAssignments
  homeAssignmentsOpenImprovementItemsAssignedToMe: { ko: '{homeTitle} {total}건', en: '{total} open improvement items assigned to me' },
  homeAssignmentsItems: { ko: '{total}건', en: '{total} items' },
  homeAssignmentsDoneAwaitingEffectCheck: { ko: '조치 완료 · 효과 확인 대기 {waiting}건', en: 'Done · Awaiting effect check: {waiting}' },

  // model
  modelUnknownStart: { ko: '시작 미상', en: 'Unknown start' },
  modelUnknownEnd: { ko: '종료 미상', en: 'Unknown end' },

  // ImprovementItems
  improvementItemsCycleTimeDetail: { ko: '사이클타임 상세', en: 'Cycle time detail' },
  improvementItemsQuestLink: { ko: '과제(Quest) 연결', en: 'Quest link' },
  improvementItemsAnalysisSource: { ko: '분석 출처', en: 'Analysis source' },

  // ImprovementDetail events
  eventCreated: { ko: '개선 아이템 생성', en: 'Item created' },
  eventUpdated: { ko: '내용 변경', en: 'Content updated' },
  eventStatusChanged: { ko: '상태 변경', en: 'Status changed' },
  eventAssigned: { ko: '담당 변경', en: 'Assignee changed' },
  eventQuestLinked: { ko: '과제(Quest) 연결 변경', en: 'Quest link changed' },
  eventReopened: { ko: '다시 열기', en: 'Reopened' },
} satisfies Record<string, Text>;
