import { describe, expect, it } from 'vitest';
import { targetStateText } from './targetState';

describe('targetStateText (#1158)', () => {
  it.each([
    [undefined, '불러오는 중입니다.', 'Loading.'],
    ['empty', '조건에 맞는 결과가 없습니다.', 'No matching result.'],
    ['forbidden', '이 Scope에 접근 권한이 없습니다.', 'You do not have access to this scope.'],
    ['too_large', '조회 범위가 너무 큽니다. 조회 조건을 좁혀 주세요.', 'Query too large. Narrow the conditions.'],
    ['error', '데이터를 불러오지 못했습니다. 본문에서 다시 시도하세요.', 'Unable to load data. Retry in the body.'],
  ])('%s follows the body state', (outcome, ko, en) => {
    expect(targetStateText('ko', outcome)).toBe(ko);
    expect(targetStateText('en', outcome)).toBe(en);
  });
});
