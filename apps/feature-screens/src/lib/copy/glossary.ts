// #679 — shared Korean UI chrome glossary (issue #679 policy; ADR-0057 A2 amendment).
// Domain nouns (VOC, Finding, Task, Task Request, Milestone) stay English; Survey, Cluster, Managed System,
// Analytics Area, Evidence and Triage use the Korean names (ADR-0110 decision 6).

export const GLOSSARY = {
  filter: '필터',
  sort: '정렬',
  refresh: '새로고침',
  save: '저장',
  cancel: '취소',
  edit: '편집',
  editTitle: '제목 편집',
  all: '전체',
  inbox: 'VOC 처리함',
  myVocs: '내 VOC',
  allFindings: '전체 Finding',
  allSurveys: '전체 설문',
  actionDashboard: '액션 대시보드',
  entityLinks: '엔티티 링크',
  permissionRequests: '권한 요청',
  coverage: '커버리지',
  untriaged: '미분류',
  high: '높음',
  unassigned: '미배정',
  noLink: '연결 없음',
  highNoLink: '높음 · 연결 없음',
  noTask: 'Task 없음',
  linkedVoc: '연결된 VOC',
  linkedCluster: '연결된 반복 VOC',
  linkedFinding: '연결된 Finding',
  linkedTask: '연결된 Task',
  requestedBy: '요청자',
  fromFinding: 'Finding에서',
  fromTaskRequest: 'Task 요청에서',
  reporterFacingStatus: '공개 상태',
  dismiss: '기각',
  dismissReason: '기각 사유',
  applyPublicUpdate: '공개 업데이트 적용',
  owner: '담당자',
  start: '시작일',
  target: '목표일',
  tasksInFlight: '진행 중 Task',
  whyThisMilestoneExists: '이 Milestone의 목적',
  milestoneStatusPlanning: '계획 중',
  milestoneStatusInProgress: '진행 중',
  milestoneStatusReleased: '릴리스됨',
  board: '보드',
  triageQueue: '분류 대기열',
  console: '콘솔',
  managedSystem: '시스템',
  unknownUser: '알 수 없는 사용자',
  evidenceHighlight: '근거 하이라이트',
  addEvidence: '근거 추가',
} as const;

/** "Open X" — opens the entity X. */
export function openLabel(name: string): string {
  return `${name} 열기`;
}

/** "New X" / "Create X" — creates entity X. */
export function createLabel(name: string): string {
  return `${name} 생성`;
}

export const CREATE_OR_LINK_FINDING_LABEL = 'Finding 생성';
