import { describe, expect, it } from 'vitest';
import { noContext } from '@ap/kernel/testing';
import { formatQuerySummary, querySummaryItems } from './querySummary';
import { formatPeriod, type GlobalContext } from '@ap/contracts';

const global: GlobalContext = { scopeId: 'S', from: null, to: null, roomNames: ['PHOTO'], lineNames: ['L1', 'L2'], prcGroups: null, condition: { vendor: ['V1'] }, membershipBasis: 'asOf', selection: [], lotIds: ['LOT'], ppid: 'PP', recipeIds: ['R'], metricId: 'M', metricVersion: '3' };
describe('query summary values', () => {
  it('includes injected axes, all carried keys, capability status and menu page labels', () => {
    const text = formatQuerySummary(global, [['grain', 'day']], { lang: 'ko', context: { ...noContext, roomNames: 'apply', condition: 'apply' }, axes: [{ id: 'vendor', label: { ko: '공급사', en: 'Vendor' }, membershipHistory: true }], pageSummary: [{ key: 'grain', label: '집계', value: '일' }] });
    for (const value of ['공정 PHOTO', 'Line L1, L2', '공급사 V1', '그 시점 소속', '명시적 빈 선택', 'LOT', 'PP', 'Recipe R', 'M @ 3', '집계 일', '이 화면에서 미사용']) expect(text).toContain(value);
  });
  it('distinguishes unrestricted, explicit empty and fixed equipment IDs', () => {
    const summary = (selection: string[] | null) => formatQuerySummary({ ...global, selection }, [], { lang: 'ko' });
    expect(summary(null)).toContain('전체 후보');
    expect(summary([])).toContain('명시적 빈 선택');
    expect(summary(['EQ-X'])).toContain('EQ-X');
  });
});

describe('query summary period (#913)', () => {
  it.each([
    ['ko', '2026-09-25T09:00:00', '2026-09-26T09:00:00', '09-25 09:00 → 09-26 09:00 (24h)'],
    ['en', '2026-09-19T09:00:00', '2026-09-26T09:00:00', '09-19 09:00 → 09-26 09:00 (7d)'],
    ['ko', '2026-09-19T09:00:00', '2026-09-26T09:00:00', '09-19 09:00 → 09-26 09:00 (7일)'],
  ] as const)('prints the same readable range as the Context bar (%s)', (lang, from, to, text) => {
    const time = querySummaryItems({ ...global, from, to }, { lang }).find(item => item.key === 'time');
    expect(time?.value).toBe(text);
    expect(time?.value).toBe(formatPeriod(from, to, lang));
    expect(formatQuerySummary({ ...global, from, to }, [], { lang })).not.toContain('[20');
  });
  it('keeps an open end visible', () => {
    expect(querySummaryItems({ ...global, from: '2026-09-25T09:00:00' }, { lang: 'ko' }).find(item => item.key === 'time')?.value).toBe('09-25 09:00 → —');
  });
});

describe('query summary with a Condition preset (ADR-0083)', () => {
  const presets = [{ id: 'eqp', label: { ko: '설비 기준', en: 'By equipment' }, axes: ['maker'] }, { id: 'org', label: { ko: '조직 기준', en: 'By organization' }, axes: ['team'] }];
  const axes = ['maker', 'team'].map(id => ({ id, label: { ko: id, en: id }, membershipHistory: false }));
  const both: GlobalContext = { ...global, condition: { maker: ['TEL'], team: ['T1'] } };
  const summary = (id: string, page: [string, string][] = [['view', id]]) => formatQuerySummary(both, page, { lang: 'ko', axes, preset: { key: 'view', presets, id } });
  it('names the preset once and drops the axes it leaves out', () => {
    const text = summary('eqp');
    expect(text).toContain('maker TEL');
    expect(text).not.toContain('team T1');
    expect(text).toContain('조건 묶음 설비 기준');
    expect(text).not.toContain('view eqp');
  });
  it('shows the switched preset, and its label even with no page value', () => {
    expect(summary('org')).toContain('team T1');
    expect(summary('org')).not.toContain('maker TEL');
    expect(summary('org', [])).toContain('조건 묶음 조직 기준');
  });
  it('is byte-for-byte the old text without the input', () => {
    expect(formatQuerySummary(both, [['view', 'eqp']], { lang: 'ko', axes })).toContain('view eqp');
    expect(formatQuerySummary(both, [['view', 'eqp']], { lang: 'ko', axes })).toContain('team T1');
  });
});
