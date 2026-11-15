/** Regression comparison copy; server-provided identifiers remain literal. */
export const datasetComparisonCopy = {
  coverage: '실행 커버리지',
  executed: (count: number) => `실행 ${count}`,
  unchecked: (count: number) => `미검사 ${count}`,
  requiredUnchecked: (count: number) => `필수 미검사 ${count}`,
  requiredRules: (rules: string) => `필수 미검사: ${rules}`,
  uncomputed: '미산출',
  unknownCoverage: '실행 — · 미검사 — · 필수 미검사 —',
  classification: '비교 분류',
  classificationHelp: '비교 분류 기준',
  classificationBasis: '미지원·원본 부재는 PASS 제외 · 새 관측은 기대 분모 제외',
  all: '전체',
  pinned: '비교 대상 고정',
  pin: (name: string, revision: number, baseline: number, runId: string, observed: { attemptNo: number; ruleSetRevision: string | null } | null) => {
    const attempt = observed ? `시도 ${observed.attemptNo} 완료 · ${observed.ruleSetRevision ?? 'RuleSet 미확인'}` : '성공한 시도 없음';
    return `${name} · r${revision} · Baseline b${baseline} · 회귀 실행 ${runId} · ${attempt}`;
  },
  requestState: '검증 요청:',
  noCoverage: '성공한 시도가 없어 실행 커버리지와 규칙 분류를 계산하지 않았습니다.',
};
