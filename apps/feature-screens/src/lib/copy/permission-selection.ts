import { CAPABILITIES, CAPABILITY_META, TOKEN_ONLY_SCOPES, isCapability, type Capability, type TokenOnlyScope } from '@ap/feature-shared';
import type { GroupedSelectionGroup, GroupedSelectionItem } from '@ap/ui';
import { CAPABILITY_LABELS } from './capabilities';

/** Categories in screen order (advisor decision #1842). A capability names one of these; there is no default category. */
export const PERMISSION_CATEGORIES = ['공통', 'VOC·Finding·Task', '개선 아이템', '설문', '로그 지식 허브', '로그 개발·검증', '로그 탐색', '설비 시각화'] as const;
export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

/** Every capability and token-only scope with its category and one-line description: a new one fails typecheck until declared here. */
export const PERMISSION_DECLARATIONS: Record<Capability | TokenOnlyScope, { category: PermissionCategory; description: string }> = {
  'workspace.read': { category: '공통', description: '접근 가능한 플랫폼 자료를 조회합니다.' },
  'workspace.admin': { category: '공통', description: '플랫폼 설정과 권한을 관리합니다.' },
  'scope.read': { category: '공통', description: '부여받은 site·room의 데이터를 읽습니다.' },
  'voc.triage': { category: 'VOC·Finding·Task', description: '시스템의 VOC를 분류하고 처리합니다.' },
  'voc.read': { category: 'VOC·Finding·Task', description: '시스템의 VOC와 내부 처리 내용을 조회합니다.' },
  'voc.read_public': { category: 'VOC·Finding·Task', description: 'VOC의 공개 내용과 공개 첨부를 조회합니다.' },
  'voc.create': { category: 'VOC·Finding·Task', description: '등록이 제한된 시스템에 VOC를 등록합니다.' },
  'finding.read': { category: 'VOC·Finding·Task', description: 'Finding과 연결된 근거를 조회합니다.' },
  'finding.manage': { category: 'VOC·Finding·Task', description: 'Finding을 작성하고 관리합니다.' },
  'task_request.self_approve': { category: 'VOC·Finding·Task', description: '본인이 만든 Task 요청을 직접 승인합니다.' },
  'survey.read': { category: '설문', description: '시스템의 설문을 조회합니다.' },
  'survey.manage': { category: '설문', description: '시스템의 설문을 만들고 관리합니다.' },
  'survey.read_personal_responses': { category: '설문', description: '설문의 개인별 응답을 조회합니다.' },
  'survey.export': { category: '설문', description: '설문 응답 데이터를 내보냅니다.' },
  'knowledge.catalog.manage': { category: '로그 지식 허브', description: '로그 지식 카탈로그의 기준정보를 관리합니다.' },
  'knowledge.catalog.import': { category: '로그 지식 허브', description: '기준정보 파일을 카탈로그로 가져옵니다.' },
  'knowledge.item.publish': { category: '로그 지식 허브', description: '로그 지식 Item을 발행합니다.' },
  'knowledge.spec.publish': { category: '로그 지식 허브', description: '모델 명세 Revision을 발행합니다.' },
  'improvement.manage': { category: '개선 아이템', description: '개선 아이템을 작성하고 변경합니다.' },
  'lifecycle.project.manage': { category: '로그 개발·검증', description: '로그 개발 건을 만들고 관리합니다.' },
  'lifecycle.round.manage': { category: '로그 개발·검증', description: '로그 검증 Round를 만들고 관리합니다.' },
  'lifecycle.gate.decide': { category: '로그 개발·검증', description: '로그 개발 단계의 Gate를 승인하거나 반려합니다.' },
  'knowledge.draft.create': { category: '로그 지식 허브', description: '새 지식이나 지식 개정 초안을 작성합니다.' },
  'explorer.source.read': { category: '로그 탐색', description: 'Source 소유자의 접근 규칙에 따라 로그 원문을 읽습니다.' },
  'explorer.export': { category: '로그 탐색', description: '로그 원문을 CSV나 JSONL로 내보냅니다.' },
  'explorer.investigate': { category: '로그 탐색', description: '로그 원문을 조사하고 조사 내용을 관리합니다.' },
  'explorer.handoff': { category: '로그 탐색', description: '로그 근거 위치를 Round나 지식 초안에 넘깁니다.' },
  'validation.catalog.report': { category: '로그 개발·검증', description: '검증기의 규칙 카탈로그 현황을 서비스 토큰으로 보고합니다.' },
  'dataset.manage': { category: '로그 개발·검증', description: '로그 테스트 데이터셋과 Revision·후보를 관리합니다.' },
  'dataset.baseline.approve': { category: '로그 개발·검증', description: '로그 테스트 데이터셋의 기준을 승인합니다.' },
  'dataset.suite.run': { category: '로그 개발·검증', description: '로그 테스트 데이터셋의 회귀 검증을 실행합니다.' },
  'knowledge.access.manage': { category: '로그 지식 허브', description: '모델·SW 버전·Item의 접근 규칙을 관리합니다.' },
  'eqv.view': { category: '설비 시각화', description: '설비 시각화 Layout·Revision·Template을 조회합니다.' },
  'eqv.layout.edit': { category: '설비 시각화', description: '설비 시각화 Layout을 편집합니다.' },
  'eqv.layout.publish': { category: '설비 시각화', description: '설비 시각화 Layout을 승인하고 게시합니다.' },
  'eqv.rules.edit': { category: '설비 시각화', description: '설비 범위의 별칭 규칙과 Type Dictionary를 편집합니다.' },
  'eqv.dictionary.global_edit': { category: '설비 시각화', description: '모든 설비에 적용되는 전역 사전과 규칙을 편집합니다.' },
  'eqv.mapping.publish': { category: '설비 시각화', description: '설비 Mapping을 게시하고 Binding에 반영합니다.' },
  'eqv.window.import': { category: '설비 시각화', description: 'Sample Window를 가져오거나 교체·폐기하고 설비를 등록합니다.' },
  'validation.worker': { category: '로그 개발·검증', description: '서비스 토큰으로 검증 요청을 점유하고 진행·결과를 보고합니다.' },
};

export function permissionSelectionItem(id: Capability | TokenOnlyScope): GroupedSelectionItem {
  const declaration = PERMISSION_DECLARATIONS[id];
  return { id, label: isCapability(id) ? CAPABILITY_LABELS[id] : '검증 작업자', description: declaration.description,
    ...(isCapability(id) && CAPABILITY_META[id].sensitive ? { badge: { label: '민감', tone: 'warning' as const } } : {}) };
}
export function groupPermissionItems(items: readonly (GroupedSelectionItem & { capability: Capability | TokenOnlyScope })[]): GroupedSelectionGroup[] {
  const groups = new Map<PermissionCategory, GroupedSelectionItem[]>();
  for (const item of items) {
    const category = PERMISSION_DECLARATIONS[item.capability].category;
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return PERMISSION_CATEGORIES.flatMap(category => {
    const members = groups.get(category);
    return members ? [{ id: category, label: category, items: members }] : [];
  });
}
export function tokenSelectionGroups(service: boolean): GroupedSelectionGroup[] {
  type Row = GroupedSelectionItem & { capability: Capability | TokenOnlyScope };
  return groupPermissionItems([...CAPABILITIES, ...TOKEN_ONLY_SCOPES].flatMap((id): Row[] => {
    if (!isCapability(id)) return service ? [{ ...permissionSelectionItem(id), capability: id }] : [];
    const meta = CAPABILITY_META[id];
    if (meta.tokenOnly && !service) return [];
    return [{ ...permissionSelectionItem(id), capability: id,
      ...(meta.sessionOnly ? { disabledReason: '로그인 세션에서만 사용 · API 토큰으로 선택할 수 없음' } : {}) }];
  }));
}
