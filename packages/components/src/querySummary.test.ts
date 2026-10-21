import { describe, expect, it } from 'vitest';
import { noContext } from '@ap/kernel/testing';
import { formatQuerySummary } from './querySummary';
import type { GlobalContext } from '@ap/contracts';

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
