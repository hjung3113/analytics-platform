import { type Capability, type DeclaredCapabilityItem, isCapability, isDeclaredCapabilityId } from '@ap/feature-shared';

export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = {
  'scope.read': 'Site·room 조회',
  'workspace.read': '전체 읽기',
  'workspace.admin': '관리자 권한',
  'voc.triage': 'VOC 분류',
  'voc.read': 'VOC 조회',
  'voc.read_public': '공개 VOC 열람',
  'voc.create': 'VOC 등록',
  'finding.read': 'Finding 조회',
  'finding.manage': 'Finding 관리',
  'task_request.self_approve': '본인 Task 요청 직접 승인',
  'survey.read': '설문 조회',
  'survey.manage': '설문 관리',
  'survey.read_personal_responses': '개인 응답 조회',
  'survey.export': '설문 데이터 내보내기',
  'knowledge.catalog.manage': '카탈로그 관리',
  'knowledge.catalog.import': '카탈로그 가져오기',
  'knowledge.item.publish': '지식 Item 발행',
  'knowledge.spec.publish': '모델 명세 발행',
  'improvement.manage': '개선 아이템 관리',
  'lifecycle.project.manage': '로그 개발 건 관리',
  'lifecycle.round.manage': '로그 검증 Round 관리',
  'lifecycle.issue.contribute': '로그 검증 등록 항목 작성·댓글',
  'lifecycle.issue.link': '로그 검증 등록 항목 근거 연결',
  'lifecycle.issue.triage': '로그 검증 등록 항목 처리',
  'lifecycle.gate.decide': '로그 개발 건 Gate 결정',
  'knowledge.draft.create': '지식 초안 작성',
  'explorer.source.read': '로그 원본 열람',
  'validation.catalog.report': '규칙 카탈로그 보고(토큰 전용)',
  'explorer.export': '로그 원본 내보내기',
  'explorer.investigate': '로그 조사',
  'explorer.handoff': '로그 근거 위치 넘기기',
  'dataset.manage': '로그 테스트 데이터셋 관리',
  'dataset.baseline.approve': '로그 테스트 기준 승인',
  'dataset.suite.run': '로그 테스트 회귀 실행',
  'knowledge.access.manage': '지식 접근 규칙 관리',
  'eqv.view': '설비 시각화 Layout 조회',
  'eqv.layout.edit': '설비 시각화 Layout 편집',
  'eqv.layout.publish': '설비 시각화 Layout 게시',
  'eqv.rules.edit': '설비 시각화 Mapping 규칙 편집',
  'eqv.dictionary.global_edit': '설비 시각화 전역 Type Dictionary·규칙 편집',
  'eqv.mapping.publish': '설비 시각화 Mapping 게시',
  'eqv.window.import': '설비 시각화 Sample Window 가져오기·설비 등록',
};

/** Marker for a grant, deny or request whose declared capability the deployment bundle no longer declares (ADR-0157). */
export const UNDECLARED_CAPABILITY_LABEL = '선언에 없음';

/**
 * A declared capability (ADR-0157 decision 9) shows its display name with its id beside it; until the server read is
 * loaded, or when the bundle no longer declares it, the id alone. Display names are plain text only.
 */
export function getCapabilityDisplayLabel(
  capability: string,
  declared: readonly DeclaredCapabilityItem[] = [],
): string {
  if (isCapability(capability)) return CAPABILITY_LABELS[capability];
  if (isDeclaredCapabilityId(capability)) {
    const item = declared.find((entry) => entry.id === capability);
    return item && item.display_name !== item.id ? `${item.display_name} (${item.id})` : capability;
  }
  return '권한 요청';
}
