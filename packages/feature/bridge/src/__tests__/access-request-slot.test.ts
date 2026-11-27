import { describe, expect, it } from 'vitest';
import { requestRead } from '../access-request-slot';

describe('requestRead (#1933): why a place state is unknown', () => {
  const base = { enabled: true, hasData: false, isError: false, fetchStatus: 'idle' as const };
  it('a place with no read (mock, session not ready, permission place) stays plain', () => {
    expect(requestRead({ ...base, enabled: false, fetchStatus: 'fetching' })).toBeUndefined();
  });
  it('checking only while a fetch really runs; a paused or idle read without data never holds the entry', () => {
    expect(requestRead({ ...base, fetchStatus: 'fetching' })).toBe('checking');
    expect(requestRead({ ...base, fetchStatus: 'paused' })).toBeUndefined();
    expect(requestRead(base)).toBeUndefined();
    expect(requestRead({ ...base, hasData: true, fetchStatus: 'fetching' })).toBeUndefined();
  });
  it('error once the read failed and nothing re-runs it; a retry in flight reads checking again', () => {
    expect(requestRead({ ...base, isError: true })).toBe('error');
    expect(requestRead({ ...base, isError: true, fetchStatus: 'paused' })).toBe('error');
    expect(requestRead({ ...base, isError: true, fetchStatus: 'fetching' })).toBe('checking');
  });
});
