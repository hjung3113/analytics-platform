import { describe, expect, it } from 'vitest';
import { PUBLISHED_ONLY, defaultFilterParams, instantText, isRevisionParam, isRowMuted, itemNoLabel, ownerText, revisionOf, stateLabel, typeLabel } from './itemModel';

describe('item model', () => {
  it('names the vocabulary (ADR-0109)', () => {
    expect(['anomaly', 'needs_check', 'behavior_note', 'guideline'].map(typeLabel)).toEqual(['이상 사례', '확인 필요', '동작 설명', '작업 기준']);
    expect(['not_checked', 'observed', 'verified', 'disputed'].map(v => stateLabel('verification', v))).toEqual(['미확인', '관찰됨', '검증됨', '이견 있음']);
    expect(['open', 'under_investigation', 'resolved'].map(v => stateLabel('processing', v))).toEqual(['열림', '조사 중', '해결됨']);
    expect(['published', 'archived'].map(v => stateLabel('publication', v))).toEqual(['발행됨', '보관됨']);
  });
  it('writes KI-<n> and the owner as model or model / SW version', () => {
    expect(itemNoLabel(12)).toBe('KI-12');
    expect(ownerText({ kind: 'model', modelId: 'm', modelName: 'MX-200' })).toBe('MX-200');
    expect(ownerText({ kind: 'software', modelId: 'm', modelName: 'MX-200', softwareId: 's', versionLabel: 'v3.2.1' })).toBe('MX-200 / v3.2.1');
  });
  it('mutes everything that is not published and defaults to published only', () => {
    expect(isRowMuted({ publicationState: 'archived' })).toBe(true);
    expect(isRowMuted({ publicationState: 'published' })).toBe(false);
    expect(defaultFilterParams()).toHaveLength(1);
    expect(PUBLISHED_ONLY).toEqual({ id: 'publicationState', op: 'in', value: ['published'] });
  });
  it('accepts only a positive integer for the rev page key', () => {
    expect(['1', '12', '999999', '1000000'].every(isRevisionParam)).toBe(true);
    expect(['0', '-1', '1.5', 'abc', '01', '', '1000001', '9999999'].some(isRevisionParam)).toBe(false);
    expect(revisionOf('1000000')).toBe(1_000_000);
    expect(revisionOf('1000001')).toBeNull();
    expect(revisionOf('3')).toBe(3);
    expect(revisionOf(null)).toBeNull();
    expect(revisionOf('x')).toBeNull();
  });

  it('renders a server instant in the viewer zone, not as sliced ISO text', () => {
    const iso = '2026-10-02T20:30:00.000Z';
    expect(instantText(iso, 'Pacific/Auckland')).toContain('10. 3.');
    expect(instantText(iso, 'UTC')).toContain('10. 2.');
    expect(instantText(iso, 'Pacific/Auckland')).not.toContain('2026-10-02');
  });
});
