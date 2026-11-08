import type { CatalogStatus, CoverageData, CoverageState, RuleDetail, RuleSetDetail, RuleSetRow, RuleRow, Support } from '../endpoints';

/** All values here are synthetic, including the model/spec ids. No in-house Validator integration is implied. */
export const FIXTURE_MODELS = {
  mixed: '00000003-0000-4000-8000-000000000008', noSpec: '00000003-0000-4000-8000-000000000009',
  noIds: '00000003-0000-4000-8000-00000000000a', full: '00000003-0000-4000-8000-00000000000b',
} as const;
/** Existing catalog fixture software ids; a version is valid only for its owning model. */
export const fixtureSoftware: Record<string, readonly string[]> = {
  [FIXTURE_MODELS.mixed]: ['00000004-0000-4000-8000-00000000000e', '00000004-0000-4000-8000-00000000000f'],
  [FIXTURE_MODELS.noSpec]: ['00000004-0000-4000-8000-000000000010'],
  [FIXTURE_MODELS.noIds]: ['00000004-0000-4000-8000-000000000011'],
};
const sourceSystem = 'synthetic-validator · 합성 fixture';
const at = '2026-11-08T11:30:00';
const supportCounts = { supported: 2, partial: 1, unsupported: 1, unknown: 1, total: 5 };
export const fixtureStatus: CatalogStatus = { received: true, sourceSystem, validatorVersion: '합성 fixture v0', lastReportedAt: at, sources: [{ sourceSystem, validatorVersion: '합성 fixture v0', reportedAt: at }], ruleSetCount: 2, ruleCount: 10, requirementIdsDeclared: true };
export const fixtureRuleSets: RuleSetRow[] = ['core', 'sequence'].map(ruleSetKey => ({
  ruleSetKey, sourceSystem, validatorVersion: '합성 fixture v0', lastReportedAt: at, revisionCount: ruleSetKey === 'core' ? 2 : 1,
  currentRevision: { revision: ruleSetKey === 'core' ? 'r2' : 'r1', resultRef: ruleSetKey === 'core' ? 'r2' : 'r1', supersedes: ruleSetKey === 'core' ? 'r1' : null }, ambiguousCurrent: false, supportCounts,
}));
export const fixtureRules: RuleDetail[] = fixtureRuleSets.flatMap(set => (['supported', 'partial', 'unsupported', 'unknown', 'supported'] as Support[]).map((support, i) => ({
  ruleSetKey: set.ruleSetKey, revision: set.currentRevision!.revision, ruleKey: `R-00${i + 1}`, title: `합성 fixture · ${['형식 확인', '대상 선언 확인', '구조 확인', '범위 확인', '명세 선언 확인'][i]}`,
  summary: '합성 fixture: Validator가 보고한 짧은 요약입니다. 선언된 범위의 지원 정보를 확인합니다.', support,
  scope: i === 3 ? null : { modelIds: [FIXTURE_MODELS.mixed], softwareRange: '2.0–2.1', inputFormats: ['CSV'] }, requiredDefault: null,
  inCurrentRevision: true, sourceSystem, lastReportedAt: at,
  targets: [{ position: 0, format: ['event', 'column', 'static-check', 'event', 'declaration'][i]!, target: ['module="CHAMBER"; event="START"', 'csv["Time Stamp"]; column: 03 (reported verbatim)', 'scope::file-header / declaration-only [v2]', 'ORIGINAL_UNBROKEN_TARGET_'.repeat(18), '합성 fixture: 명세 키 선언'][i]!, requirementIds: i === 0 ? [] : i === 1 ? ['CHAMBER/STOP'] : i === 2 ? ['CHAMBER/PURGE', 'LEGACY/ORPHAN'] : i === 3 ? ['ROBOT'] : ['ROBOT/READY', 'FULL/A', 'FULL/B', 'FULL/C'] }],
  revisions: set.ruleSetKey === 'core' ? [
    { revision: 'r1', status: 'retired', retired: true, isCurrent: false, support: i === 1 ? 'unknown' : support },
    { revision: 'r2', status: 'active', retired: false, isCurrent: true, support },
  ] : [{ revision: 'r1', status: 'active', retired: false, isCurrent: true, support }],
})));
export const fixtureRows: RuleRow[] = fixtureRules.map(({ targets, revisions: _revisions, inCurrentRevision: _current, sourceSystem: _source, lastReportedAt: _at, ...row }) => ({
  ...row, firstTarget: targets[0] ?? null, targetCount: targets.length, requirementIdCount: new Set(targets.flatMap(t => t.requirementIds)).size,
}));
export const fixtureHistories: RuleSetDetail[] = fixtureRuleSets.map(({ revisionCount: _count, supportCounts: _counts, ...set }) => ({ ...set,
  revisions: (set.ruleSetKey === 'core' ? ['r1', 'r2'] : ['r1']).map((revision, i) => ({
    revision, resultRef: revision, status: set.ruleSetKey === 'core' && i === 0 ? 'retired' : 'active', retired: set.ruleSetKey === 'core' && i === 0,
    supersedes: i === 1 ? 'r1' : null, isCurrent: revision === set.currentRevision?.revision, ruleCount: 5, supportCounts,
    previousRevision: i === 1 ? 'r1' : null, changes: i === 1 ? { added: ['R-004'], removed: ['R-006'], supportChanged: [{ ruleKey: 'R-002', from: 'unknown', to: 'partial' }], addedCount: 1, removedCount: 1, supportChangedCount: 1, truncated: false } : null,
  })),
}));
const specPin = { revisionId: '00000005-0000-4000-8000-000000000001', changeSetDigest: 'synthetic-fixture-digest' };
export function fixtureCoverage(modelId: string): CoverageData | null {
  if (!Object.values(FIXTURE_MODELS).includes(modelId as typeof FIXTURE_MODELS.mixed)) return null;
  if (modelId === FIXTURE_MODELS.noSpec) return { computable: false, reason: 'no_spec', specPin: null };
  if (modelId === FIXTURE_MODELS.noIds) return { computable: false, reason: 'no_requirement_ids', specPin };
  const states: CoverageState[] = modelId === FIXTURE_MODELS.full ? ['covered', 'covered', 'covered'] : ['no_rule', 'unsupported', 'unknown', 'partial', 'covered'];
  const keys = modelId === FIXTURE_MODELS.full ? ['FULL/A', 'FULL/B', 'FULL/C'] : ['ARM/PICK', 'CHAMBER/PURGE', 'ROBOT', 'CHAMBER/STOP', 'ROBOT/READY'];
  const rows = states.map((state, i) => {
    const key = keys[i]!;
    const declaredBy = fixtureRules.filter(rule => rule.targets.some(t => t.requirementIds.includes(key)))
      .map(({ ruleSetKey, revision, ruleKey, support }) => ({ ruleSetKey, revision, ruleKey, support }));
    return { key, state, declaredCount: declaredBy.length, declaredBy };
  });
  const counts = { no_rule: 0, unsupported: 0, unknown: 0, partial: 0, covered: 0, total: rows.length };
  for (const row of rows) counts[row.state]++;
  return { computable: true, specPin, coverageDigest: `synthetic-fixture-${modelId}`, counts, ruleSetRevisions: fixtureRuleSets.map(s => ({ ruleSetKey: s.ruleSetKey, revision: s.currentRevision!.revision, resultRef: s.currentRevision!.resultRef, revisionDigest: 'synthetic-fixture' })), rows, total: rows.length, page: 0, pageSize: 50 };
}
