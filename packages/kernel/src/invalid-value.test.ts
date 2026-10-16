import { describe, expect, it } from 'vitest';
import { invalidValueSentence, userFacingEntries } from './i18n';

const SORT = { ko: '정렬', en: 'Sort' };
const PAGE = { ko: '페이지', en: 'Page' };

describe('invalidValueSentence (ADR-0034 wording)', () => {
  it.each([
    ['value', 'ko', SORT, 'bogus', '정렬 “bogus”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.'],
    ['value', 'en', SORT, 'bogus', 'Sort “bogus” is not a value this page can use. Reset the conditions.'],
    ['value', 'ko', PAGE, '0', '페이지 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.'],
    ['value', 'en', PAGE, '0', 'Page “0” is not a value this page can use. Reset the conditions.'],
    ['filter', 'ko', { ko: '상태', en: 'Status' }, 'x', '상태 “x”는 이 화면에서 쓸 수 없는 필터입니다. 조건을 초기화하세요.'],
    ['filter', 'en', { ko: '상태', en: 'Status' }, 'x', 'Status “x” is not available on this screen. Reset the filters.'],
    ['filter', 'ko', { ko: '도메인', en: 'Domain' }, 'x', '도메인 “x”은 이 화면에서 쓸 수 없는 필터입니다. 조건을 초기화하세요.'],
    ['filter', 'en', { ko: '도메인', en: 'Domain' }, 'x', 'Domain “x” is not available on this screen. Reset the filters.'],
    ['plain', 'ko', { ko: '지표', en: 'Metric' }, 'zzz', '지표 “zzz”는 이 화면에서 쓸 수 없습니다.'],
    ['plain', 'en', { ko: '지표', en: 'Metric' }, 'zzz', 'Metric “zzz” cannot be used on this page.'],
    ['plain', 'ko', { ko: '느린 실행 기준', en: 'Slow executions' }, 'q', '느린 실행 기준 “q”은 이 화면에서 쓸 수 없습니다.'],
    ['drillGap', 'ko', { ko: '설비', en: 'Equipment' }, 'E1', '설비 “E1”는 앞 단계 없이 쓸 수 없습니다.'],
    ['drillGap', 'en', { ko: '설비', en: 'Equipment' }, 'E1', 'Equipment “E1” cannot be used without the earlier steps.'],
    ['drillGap', 'ko', { ko: '공정', en: 'Process' }, 'LATE', '공정 “LATE”은 앞 단계 없이 쓸 수 없습니다.'],
    ['plain', 'en', { ko: '느린 실행 기준', en: 'Slow executions' }, 'q', 'Slow executions “q” cannot be used on this page.'],
  ] as const)('%s / %s', (kind, lang, field, raw, expected) => {
    expect(invalidValueSentence(lang, kind, field, raw)).toBe(expected);
  });

  it.each([
    ['정렬', '은'],
    ['페이지', '는'],
    ['A', '는'],
    ['필드1', '는'],
    ['', '는'],
  ])('particle follows the last character of the Korean field name: %s → %s', (ko, particle) => {
    expect(invalidValueSentence('ko', 'plain', { ko, en: 'F' }, 'v')).toBe(`${ko} “v”${particle} 이 화면에서 쓸 수 없습니다.`);
  });

  it.each([
    ['empty', ''],
    ['long', 'x'.repeat(250)],
    ['quotes', '“a” ”b“'],
    ['placeholder', '{raw} {field} {particle}'],
    ['replacement pattern', "$& $1 $$ $` $'"],
    ['spaces', '  a  b  '],
  ])('keeps the raw value as entered: %s', (_name, raw) => {
    expect(invalidValueSentence('ko', 'plain', SORT, raw)).toBe(`정렬 “${raw}”은 이 화면에서 쓸 수 없습니다.`);
    expect(invalidValueSentence('en', 'value', SORT, raw)).toBe(`Sort “${raw}” is not a value this page can use. Reset the conditions.`);
  });

  it('exposes the templates to the user-facing copy check without key=value', () => {
    const entries = userFacingEntries().filter(entry => entry.key.startsWith('invalidUrl'));
    expect(entries.map(entry => entry.key).sort()).toEqual(['invalidUrlDrillGap', 'invalidUrlFilter', 'invalidUrlPlain', 'invalidUrlValue']);
    for (const entry of entries) expect(`${entry.ko}${entry.en}`).not.toMatch(/\w=/);
  });
});
