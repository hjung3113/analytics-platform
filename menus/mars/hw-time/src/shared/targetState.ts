/**
 * The Inspector `분석 대상` text while there are no counts to show: it follows the query the body shows, so the Inspector never says loading
 * next to a body that already says zero rows or a failure (#1158). Wording mirrors the body's states (kernel `stateEmpty`, `stateForbidden`, `stateTooLarge`, `stateError`).
 */
export function targetStateText(lang: 'ko' | 'en', outcome: string | undefined): string {
  const ko = lang === 'ko';
  if (outcome === undefined) return ko ? '불러오는 중입니다.' : 'Loading.';
  if (outcome === 'empty') return ko ? '조건에 맞는 결과가 없습니다.' : 'No matching result.';
  if (outcome === 'forbidden') return ko ? '이 Scope에 접근 권한이 없습니다.' : 'You do not have access to this scope.';
  if (outcome === 'too_large') return ko ? '조회 범위가 너무 큽니다. 조회 조건을 좁혀 주세요.' : 'Query too large. Narrow the conditions.';
  return ko ? '데이터를 불러오지 못했습니다. 본문에서 다시 시도하세요.' : 'Unable to load data. Retry in the body.';
}
