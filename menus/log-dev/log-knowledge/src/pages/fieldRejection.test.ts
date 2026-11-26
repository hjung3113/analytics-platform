import { describe, expect, it } from 'vitest';
import { SERVER_FIELDS_SUMMARY, withFieldsSummary } from './fieldRejection';

describe('withFieldsSummary', () => {
  it('adds the summary when a field key was mapped', () => {
    expect(withFieldsSummary({ code: '같은 코드가 이미 있습니다' })).toEqual({ code: '같은 코드가 이미 있습니다', form: SERVER_FIELDS_SUMMARY });
  });

  it('keeps a server form text over the summary', () => {
    expect(withFieldsSummary({ code: 'x', form: '서버 문장' })).toEqual({ code: 'x', form: '서버 문장' });
  });

  it('adds nothing when only form or self-announced keys were mapped', () => {
    expect(withFieldsSummary({})).toEqual({});
    expect(withFieldsSummary({ form: '서버 문장' })).toEqual({ form: '서버 문장' });
    expect(withFieldsSummary({ subjects: '대상 오류' }, ['subjects'])).toEqual({ subjects: '대상 오류' });
  });

  it('does not change the map it was given', () => {
    const mapped = { code: 'x' };
    withFieldsSummary(mapped);
    expect(mapped).toEqual({ code: 'x' });
  });
});
