import { type Capability, isCapability } from '@ap/feature-shared';

export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = {
  'workspace.read': '워크스페이스 전체 읽기',
  'workspace.admin': '워크스페이스 관리자 권한',
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
  'lifecycle.project.manage': '로그 개발 과제 관리',
  'lifecycle.round.manage': '로그 검증 Round 관리',
  'knowledge.draft.create': '지식 초안 작성',
  'explorer.source.read': '로그 원본 열람',
  'validation.catalog.report': '규칙 카탈로그 보고(토큰 전용)',
  'explorer.export': '로그 원본 내보내기',
  'explorer.investigate': '로그 조사',
  'dataset.manage': '로그 테스트 데이터셋 관리',
  'knowledge.access.manage': '지식 접근 규칙 관리',
};

export function getCapabilityDisplayLabel(capability: string): string {
  return isCapability(capability) ? CAPABILITY_LABELS[capability] : '권한 요청';
}
