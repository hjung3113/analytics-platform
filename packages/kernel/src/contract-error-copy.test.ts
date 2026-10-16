import { describe, expect, it } from 'vitest';
import { contractErrorSentence, URL_FIELD_NAMES } from './i18n';

const ACTION = { ko: '주소를 고치거나 조건을 초기화하세요.', en: 'Fix the address or reset the conditions.' };
const GENERIC = { ko: '주소의 값이 올바르지 않아 조회하지 않았습니다. 주소를 고치거나 조건을 초기화하세요.', en: 'The address has a value this page cannot use. Fix the address or reset the conditions.' };

describe('contractErrorSentence (ADR-0034, #397)', () => {
  it.each([
    ['partial_period', '기간의 시작과 끝 중 하나만 있습니다.', 'Only one end of the period is in the address.'],
    ['invalid_period', '기간의 시작이 끝보다 늦습니다.', 'The period starts after it ends.'],
    ['duplicate_singleton', '같은 키가 주소에 두 번 있습니다.', 'The same key is written twice in the address.'],
    ['duplicate_page_key', '같은 키가 주소에 두 번 있습니다.', 'The same key is written twice in the address.'],
    ['alias_conflict', '설비 선택을 두 이름으로 같이 적었습니다.', 'The equipment selection is written under both names.'],
    ['metric_pair', '지표 버전만 있고 어느 지표인지 없습니다.', 'A metric version is present without the metric.'],
    ['metric_pair_incomplete', '지표만 있고 버전이 없습니다.', 'A metric is present without its version.'],
    ['invalid_set', '빈 선택 표시와 목록을 주소에 같이 적었습니다.', 'An empty-selection mark and a list are both written in the address.'],
  ])('%s: cause then action', (code, ko, en) => {
    expect(contractErrorSentence('ko', { code })).toBe(`${ko} ${ACTION.ko}`);
    expect(contractErrorSentence('en', { code })).toBe(`${en} ${ACTION.en}`);
  });

  it.each(['invalid_id', 'invalid_condition', 'invalid_time', 'unsupported_version', 'something_new'])('%s without field/raw falls back to the generic body', code => {
    expect(contractErrorSentence('ko', { code })).toBe(GENERIC.ko);
    expect(contractErrorSentence('en', { code })).toBe(GENERIC.en);
  });

  it.each([
    ['invalid_time', 'from', 'garbage', '시작 시각 “garbage”은 이 화면에서 쓸 수 없습니다.', 'Start time “garbage” cannot be used on this page.'],
    ['invalid_id', 'scopeId', ' ', 'Scope “ ”는 이 화면에서 쓸 수 없습니다.', 'Scope “ ” cannot be used on this page.'],
    ['unsupported_version', 'v', '2', '주소 버전 “2”은 이 화면에서 쓸 수 없습니다.', 'Address version “2” cannot be used on this page.'],
  ])('%s / %s quotes the raw value and never key=value', (code, field, raw, ko, en) => {
    expect(contractErrorSentence('ko', { code, field, raw })).toBe(`${ko} ${ACTION.ko}`);
    expect(contractErrorSentence('en', { code, field, raw })).toBe(`${en} ${ACTION.en}`);
  });

  it('an unmapped field falls back to the code cause', () => {
    expect(contractErrorSentence('en', { code: 'partial_period', field: 'zzz', raw: 'x' })).toBe(`Only one end of the period is in the address. ${ACTION.en}`);
  });

  it.each([
    'from', 'to', 'scopeId', 'v', 'roomNames', 'selectedEquipmentIds', 'lotIds', 'recipeIds', 'ppid', 'metricId', 'metricVersion', 'equipmentGroup',
    'roomSelection', 'equipmentSelection', 'lotSelection', 'recipeSelection',
  ])('field map names %s in both languages without contract vocabulary', key => {
    const name = URL_FIELD_NAMES[key];
    expect(name.ko).toBeTruthy();
    expect(name.en).toBeTruthy();
    expect(`${name.ko}${name.en}`).not.toMatch(/=|URL|§/);
  });
});
