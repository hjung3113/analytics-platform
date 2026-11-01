import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, AUDIT_ACTIONS, AUDIT_SOURCES, AUDIT_TYPE_TOKEN, SOURCE_LABEL, TYPE_LABEL } from './audit-query';

describe('audit value domains follow their displayed keys', () => {
  it.each(Object.keys(TYPE_LABEL))('the labeled type %s is a valid token', value => {
    expect(AUDIT_TYPE_TOKEN.test(value)).toBe(true);
  });
  it('every labeled action and source is a member', () => {
    expect(AUDIT_ACTIONS).toEqual(Object.keys(ACTION_LABEL));
    expect(AUDIT_SOURCES).toEqual(Object.keys(SOURCE_LABEL));
  });
});

// §6: the words are copied from AuditTimeline, not exported from components. A new AuditAction must fail
// this table until a reviewer copies its word here too.
describe('ACTION_LABEL', () => {
  it('carries exactly the five timeline words, ko and en', () => {
    expect(ACTION_LABEL).toEqual({
      create: { ko: '생성', en: 'Created' },
      update: { ko: '변경', en: 'Updated' },
      retire: { ko: '사용중지', en: 'Retired' },
      sync: { ko: '동기화', en: 'Synced' },
      delete: { ko: '삭제', en: 'Deleted' },
    });
  });
});
