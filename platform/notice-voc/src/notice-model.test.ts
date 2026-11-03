import { describe, expect, it } from 'vitest';
import type { Notice } from '@ap/contracts';
import { attemptFor, groupNotices, isActive, isWallClock, seoulWallClock, toDraft, validateForm, withSeconds, emptyForm } from './notice-model';

const notice = (id: string, until: string): Notice => ({ id, title: { ko: id, en: id }, content: { ko: 'c', en: 'c' }, scopeId: null, until, version: 'v1' });

describe('notice model', () => {
  it('is active only when until is strictly later than now (equality is expired)', () => {
    expect(isActive({ until: '2026-11-03T12:00:01' }, '2026-11-03T12:00:00')).toBe(true);
    expect(isActive({ until: '2026-11-03T12:00:00' }, '2026-11-03T12:00:00')).toBe(false);
    expect(isActive({ until: '2026-11-03T11:59:59' }, '2026-11-03T12:00:00')).toBe(false);
  });

  it('groups active by until descending and the expired rest apart', () => {
    const { active, expired } = groupNotices([notice('a', '2026-11-05T00:00:00'), notice('b', '2026-10-01T00:00:00'), notice('c', '2026-12-01T00:00:00'), notice('d', '2026-11-03T12:00:00')], '2026-11-03T12:00:00');
    expect(active.map(n => n.id)).toEqual(['c', 'a']);
    expect(expired.map(n => n.id)).toEqual(['d', 'b']);
  });

  it('reads the Asia/Seoul wall clock regardless of the process zone', () => {
    // 2026-11-03T20:30:15Z is 2026-11-04 05:30:15 in Seoul (UTC+9).
    expect(seoulWallClock(new Date('2026-11-03T20:30:15Z'))).toBe('2026-11-04T05:30:15');
    expect(seoulWallClock(new Date('2026-11-03T15:00:00Z'))).toBe('2026-11-04T00:00:00');
  });

  it('accepts only real calendar wall-clock values', () => {
    expect(isWallClock('2026-11-03T12:00:00')).toBe(true);
    expect(isWallClock('2026-02-30T12:00:00')).toBe(false);
    expect(isWallClock('2026-11-03T24:00:00')).toBe(false);
    expect(isWallClock('2026-11-03T12:00:00Z')).toBe(false);
    expect(isWallClock('2026-11-03T12:00')).toBe(false);
  });

  it('builds the exact wire draft: seconds added, no zone conversion, scopeId null', () => {
    const form = { ...emptyForm(), titleKo: '제목', titleEn: '', contentKo: '내용', contentEn: '', until: '2026-12-01T09:30' };
    expect(toDraft(form)).toEqual({ title: { ko: '제목', en: '' }, content: { ko: '내용', en: '' }, scopeId: null, until: '2026-12-01T09:30:00' });
    expect(withSeconds('2026-12-01T09:30:05')).toBe('2026-12-01T09:30:05');
  });

  it('enforces the server limits on the form', () => {
    const ok = { ...emptyForm(), titleKo: 't', contentKo: 'c', until: '2026-12-01T09:30:00' };
    expect(validateForm(ok)).toEqual({});
    expect(validateForm({ ...ok, titleKo: 'x'.repeat(201) }).titleKo).toBe('too_long');
    expect(validateForm({ ...ok, titleKo: 'x'.repeat(200) }).titleKo).toBeUndefined();
    expect(validateForm({ ...ok, contentEn: 'x'.repeat(10_001) }).contentEn).toBe('too_long');
    expect(validateForm({ ...ok, until: '2026-02-30T00:00' }).until).toBe('invalid');
    expect(validateForm(emptyForm())).toMatchObject({ titleKo: 'required', contentKo: 'required', until: 'required' });
  });

  it('keeps the key for an identical retry and mints a new one for changed input', () => {
    let n = 0;
    const mint = () => `key-${++n}`;
    const first = attemptFor(null, 'a', mint);
    expect(attemptFor(first, 'a', mint)).toBe(first);
    expect(attemptFor(first, 'b', mint).key).toBe('key-2');
  });
});
