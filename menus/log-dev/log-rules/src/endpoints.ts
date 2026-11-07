/** Client-safe snapshot declarations. Server mirror: log-rules/{catalog,coverage}-endpoints.ts (ADR-0122). */
import { defineEndpoint, type ColumnFilter, type ColumnFilterSpec, type PageResult, type PageSort } from '@ap/contracts';

export const LOG_RULES_MENU_ID = 'log-rules';
export const SUPPORTS = ['supported', 'partial', 'unsupported', 'unknown'] as const;
export type Support = typeof SUPPORTS[number];
export const SUPPORT_LABEL: Record<Support, string> = { supported: '지원', partial: '일부', unsupported: '미지원', unknown: '확인 불가' };
export const COVERAGE_STATES = ['no_rule', 'unsupported', 'unknown', 'partial', 'covered'] as const;
export type CoverageState = typeof COVERAGE_STATES[number];
export const COVERAGE_LABEL: Record<CoverageState, string> = { no_rule: '규칙 없음', unsupported: '미지원', unknown: '확인 불가', partial: '일부', covered: '규칙 있음' };
export const NOT_COMPUTABLE_REASONS = ['model_unknown', 'ambiguous_key', 'no_spec', 'no_catalog', 'no_requirement_ids'] as const;
export type CoverageReason = typeof NOT_COMPUTABLE_REASONS[number];
export const REASON_COPY: Record<CoverageReason, string> = {
  model_unknown: '모델 또는 SW 버전을 찾을 수 없습니다. 선택한 ID를 확인해 주세요.',
  ambiguous_key: '명세 요구사항 키가 비어 있거나 구분자와 겹쳐 짝을 확인할 수 없습니다.',
  no_spec: '이 모델에 발행된 명세가 없습니다.',
  no_catalog: '카탈로그를 아직 받지 못했습니다. Validator 보고가 필요합니다.',
  no_requirement_ids: 'Validator가 요구사항 ID를 주지 않았습니다.',
};
export const isUuid = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isCatalogKey = (s: string): boolean => s.length > 0 && s.length <= 200 && s === s.trim() && !/[\u0000-\u001f\u007f-\u009f]/.test(s);
export const RULE_SET_SORT_IDS = ['ruleSetKey', 'sourceSystem', 'revisionCount', 'ruleCount', 'reportedAt'] as const;
export const RULE_SORT_IDS = ['ruleSetKey', 'ruleKey', 'title', 'support', 'revision', 'targetCount', 'requirementIdCount'] as const;
const textSpec: ColumnFilterSpec = { kind: 'enum', options: [], ops: ['in', 'notIn'] };
const presenceSpec: ColumnFilterSpec = { kind: 'enum', options: [], ops: ['isEmpty', 'isNotEmpty'], multiple: false };
export const ruleSetFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = { ruleSetKey: textSpec, sourceSystem: textSpec };
export const ruleWireFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = {
  support: { kind: 'enum', options: SUPPORTS.map(value => ({ value, label: SUPPORT_LABEL[value] })), ops: ['in', 'notIn'] },
  ruleSetKey: textSpec, scope: presenceSpec, requirementIds: presenceSpec,
};
/** UI-only target text condition is translated to the existing server targetQ parameter. */
export const ruleFilterSpecs: Readonly<Record<string, ColumnFilterSpec>> = {
  ...ruleWireFilterSpecs, targetCount: { kind: 'text', ops: ['contains'] },
};
export type CatalogParams = { q?: string | null; page?: number; pageSize?: number; sorting?: PageSort[]; filters?: ColumnFilter[] };
export type RuleParams = CatalogParams & { targetQ?: string | null };
export type SupportCounts = Record<Support, number> & { total: number };
export type Scope = { logTypes?: string[]; processes?: string[]; modelIds?: string[]; softwareRange?: string; inputFormats?: string[] };
export type Target = { format: string; target: string };
export type RuleRow = {
  ruleSetKey: string; revision: string; ruleKey: string; title: string; summary: string; support: Support;
  scope: Scope | null; requiredDefault: boolean | null; targetCount: number; requirementIdCount: number; firstTarget: Target | null;
};
export type CurrentRevision = { revision: string; resultRef: string; supersedes: string | null };
export type RuleSetRow = {
  ruleSetKey: string; sourceSystem: string; validatorVersion: string; lastReportedAt: string; revisionCount: number;
  currentRevision: CurrentRevision | null; ambiguousCurrent: boolean; supportCounts: SupportCounts;
};
export type RevisionChanges = { added: string[]; removed: string[]; supportChanged: { ruleKey: string; from: Support; to: Support }[]; addedCount: number; removedCount: number; supportChangedCount: number; truncated: boolean };
export type RuleSetDetail = Omit<RuleSetRow, 'revisionCount' | 'supportCounts'> & {
  revisions: { revision: string; resultRef: string; status: 'active' | 'retired'; retired: boolean; supersedes: string | null; isCurrent: boolean; ruleCount: number; supportCounts: SupportCounts; previousRevision: string | null; changes: RevisionChanges | null }[];
};
export type RuleDetail = Omit<RuleRow, 'firstTarget' | 'targetCount' | 'requirementIdCount'> & {
  inCurrentRevision: boolean; sourceSystem: string; lastReportedAt: string;
  targets: (Target & { position: number; requirementIds: string[] })[];
  revisions: { revision: string; status: 'active' | 'retired'; retired: boolean; isCurrent: boolean; support: Support | null }[];
};
export type CatalogStatus = {
  received: boolean; lastReportedAt: string | null; sourceSystem: string | null; validatorVersion: string | null;
  sources: { sourceSystem: string; validatorVersion: string; reportedAt: string }[]; ruleSetCount: number; ruleCount: number; requirementIdsDeclared: boolean | null;
};
export type SpecPin = { revisionId: string; changeSetDigest: string };
export type DeclaringRule = { ruleSetKey: string; revision: string; ruleKey: string; support: Support };
export type RequirementRow = { key: string; state: CoverageState; declaredCount: number; declaredBy: DeclaringRule[] };
export type CoverageCounts = Record<CoverageState, number> & { total: number };
export type CoverageData = { computable: false; reason: CoverageReason; specPin: SpecPin | null; ambiguousKeys?: string[] } | {
  computable: true; specPin: SpecPin; coverageDigest: string; counts: CoverageCounts;
  ruleSetRevisions: { ruleSetKey: string; revision: string; resultRef: string; revisionDigest: string }[];
  rows: RequirementRow[]; total: number; page: number; pageSize: number;
};
export type CoverageParams = { modelId: string; softwareId?: string | null; page?: number; pageSize?: number };
export type CoverageSummaryRow = { modelId: string } & ({ computable: false; reason: CoverageReason } | { computable: true; counts: CoverageCounts; coverageDigest: string });
const listKeys = { q: true, page: true, pageSize: true, sorting: true, filters: true } as const;
const read = <P, T>(name: string, paramKeys: { [K in keyof P]-?: true }) => defineEndpoint<P, T>({
  id: `logRules.${name}`, menuId: LOG_RULES_MENU_ID, paramKeys, permission: 'platform:view', requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});
export const ruleSetsEndpoint = read<CatalogParams, PageResult<RuleSetRow>>('ruleSets', listKeys);
export const ruleSetDetailEndpoint = read<{ ruleSetKey: string }, RuleSetDetail | null>('ruleSetDetail', { ruleSetKey: true });
export const rulesEndpoint = read<RuleParams, PageResult<RuleRow>>('rules', { ...listKeys, targetQ: true });
export const ruleDetailEndpoint = read<{ ruleSetKey: string; ruleKey: string }, RuleDetail | null>('ruleDetail', { ruleSetKey: true, ruleKey: true });
export const catalogStatusEndpoint = read<Record<string, never>, CatalogStatus>('catalogStatus', {});
export const coverageEndpoint = read<CoverageParams, CoverageData | null>('coverage', { modelId: true, softwareId: true, page: true, pageSize: true });
export const coverageSummaryEndpoint = read<{ modelIds: string[] }, { rows: CoverageSummaryRow[] }>('coverageSummary', { modelIds: true });
export const endpointSpecs = [ruleSetsEndpoint, ruleSetDetailEndpoint, rulesEndpoint, ruleDetailEndpoint, catalogStatusEndpoint, coverageEndpoint, coverageSummaryEndpoint] as const;
