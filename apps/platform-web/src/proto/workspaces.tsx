// THROWAWAY #250 — never merge.
// Placeholder manifests for the two workspaces that have no menu package. No component → planned.
import { ClipboardList, FileSearch, Handshake, ListChecks, ScrollText, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Capability, ContextKey, GroupId, Permission } from '@ap/contracts';
import type { GroupDef, MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

type Item = { id: string; ko: string; en: string; path: string };

function planned(group: GroupId, icon: LucideIcon, permission: Permission, items: Item[]): MenuEntry[] {
  return items.map((item, index) => ({
    id: item.id, group, primary: index === 0, label: { ko: item.ko, en: item.en },
    description: { ko: '시안 자리 메뉴', en: 'Prototype placeholder' },
    path: item.path, icon, permission, requiresScope: false, context: none, pageType: 'management', features: noFeatures, pageKeys: [],
  }));
}

const LOGDEV: { group: GroupId; icon: LucideIcon; items: Item[] }[] = [
  { group: 'logdevStatus', icon: ScrollText, items: [
    { id: 'logdev-model-status', ko: '설비 모델 현황', en: 'Equipment model status', path: '/logdev/status/models' },
    { id: 'logdev-stage', ko: '단계별 진행', en: 'Progress by stage', path: '/logdev/status/stages' },
    { id: 'logdev-schedule', ko: '개발 일정', en: 'Development schedule', path: '/logdev/status/schedule' },
    { id: 'logdev-owners', ko: '담당자 배정', en: 'Owner assignment', path: '/logdev/status/owners' },
    { id: 'logdev-done', ko: '이번 주 완료', en: 'Finished this week', path: '/logdev/status/done' },
    { id: 'logdev-late', ko: '지연 항목', en: 'Late items', path: '/logdev/status/late' },
    { id: 'logdev-notes', ko: '개발 메모', en: 'Development notes', path: '/logdev/status/notes' },
  ] },
  { group: 'logdevModels', icon: ListChecks, items: [
    { id: 'logdev-model-list', ko: '모델 목록', en: 'Model list', path: '/logdev/models' },
    { id: 'logdev-alpha', ko: 'Alpha', en: 'Alpha', path: '/logdev/models/alpha' },
    { id: 'logdev-beta', ko: 'Beta', en: 'Beta', path: '/logdev/models/beta' },
    { id: 'logdev-model-stage', ko: '모델별 단계', en: 'Stage by model', path: '/logdev/models/stages' },
    { id: 'logdev-params', ko: '파라미터 세트', en: 'Parameter sets', path: '/logdev/models/params' },
    { id: 'logdev-model-history', ko: '변경 이력', en: 'Change history', path: '/logdev/models/history' },
    { id: 'logdev-model-compare', ko: '모델 비교', en: 'Compare models', path: '/logdev/models/compare' },
  ] },
  { group: 'logdevValidation', icon: FileSearch, items: [
    { id: 'logdev-round', ko: '검증 Round', en: 'Validation round', path: '/logdev/validation/rounds' },
    { id: 'logdev-rule-errors', ko: '규칙 오류', en: 'Rule errors', path: '/logdev/validation/rule-errors' },
    { id: 'logdev-defects', ko: '결함 목록', en: 'Defect list', path: '/logdev/validation/defects' },
    { id: 'logdev-recheck', ko: '재검증 대기', en: 'Waiting recheck', path: '/logdev/validation/recheck' },
    { id: 'logdev-source', ko: '원문 위치', en: 'Source location', path: '/logdev/validation/source' },
    { id: 'logdev-validation-history', ko: '검증 이력', en: 'Validation history', path: '/logdev/validation/history' },
    { id: 'logdev-rules', ko: '규칙 세트', en: 'Rule set', path: '/logdev/validation/rules' },
  ] },
  { group: 'logdevPartner', icon: Handshake, items: [
    { id: 'logdev-review-request', ko: '협력사 검토 요청', en: 'Partner review request', path: '/logdev/partner/requests' },
    { id: 'logdev-review-history', ko: '검토 이력', en: 'Review history', path: '/logdev/partner/history' },
    { id: 'logdev-xlsx', ko: 'XLSX 내보내기', en: 'XLSX export', path: '/logdev/partner/xlsx' },
    { id: 'logdev-reply', ko: '회신 대기', en: 'Waiting for reply', path: '/logdev/partner/replies' },
    { id: 'logdev-comments', ko: '검토 의견', en: 'Review comments', path: '/logdev/partner/comments' },
    { id: 'logdev-attachments', ko: '첨부 목록', en: 'Attachments', path: '/logdev/partner/files' },
    { id: 'logdev-due', ko: '마감 일정', en: 'Due dates', path: '/logdev/partner/due' },
  ] },
];

const IMPROVE: { group: GroupId; icon: LucideIcon; items: Item[] }[] = [
  { group: 'improveTasks', icon: ClipboardList, items: [
    { id: 'improve-tasks', ko: '개선 과제', en: 'Improvement tasks', path: '/improvement/tasks' },
    { id: 'improve-targets', ko: '대상 설비', en: 'Target equipment', path: '/improvement/targets' },
    { id: 'improve-schedule', ko: '과제 일정', en: 'Task schedule', path: '/improvement/schedule' },
    { id: 'improve-owners', ko: '담당 배정', en: 'Owner assignment', path: '/improvement/owners' },
  ] },
  { group: 'improveField', icon: Wrench, items: [
    { id: 'improve-apply', ko: '현장 적용', en: 'Shop-floor application', path: '/improvement/apply' },
    { id: 'improve-results', ko: '성과 입력', en: 'Result entry', path: '/improvement/results' },
    { id: 'improve-verify', ko: '성과 검증', en: 'Result check', path: '/improvement/verify' },
    { id: 'improve-history', ko: '적용 이력', en: 'Application history', path: '/improvement/history' },
  ] },
];

export function placeholderGroups(): GroupDef[] {
  return [
    { id: 'logdevStatus', label: { ko: '개발 현황', en: 'Development status' }, icon: ScrollText, space: 'logdev' },
    { id: 'logdevModels', label: { ko: '모델별 개발', en: 'Development by model' }, icon: ListChecks, space: 'logdev' },
    { id: 'logdevValidation', label: { ko: '검증', en: 'Validation' }, icon: FileSearch, space: 'logdev' },
    { id: 'logdevPartner', label: { ko: '협력사 검토', en: 'Partner review' }, icon: Handshake, space: 'logdev' },
    { id: 'improveTasks', label: { ko: '개선 과제', en: 'Improvement tasks' }, icon: ClipboardList, space: 'improvement' },
    { id: 'improveField', label: { ko: '현장 적용', en: 'Shop-floor application' }, icon: Wrench, space: 'improvement' },
  ];
}

export function placeholderMenus(): MenuEntry[] {
  return [
    ...LOGDEV.flatMap(block => planned(block.group, block.icon, 'logdev:view', block.items)),
    ...IMPROVE.flatMap(block => planned(block.group, block.icon, 'improve:view', block.items)),
  ];
}
