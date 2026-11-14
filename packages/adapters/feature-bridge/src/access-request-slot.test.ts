import { describe, expect, it } from 'vitest';
import { requestRead } from './access-request-slot';

describe('requestRead (#1933): why a place state is unknown', () => {
  const base = { enabled: true, hasData: false, isError: false, isFetching: false };
  it('a place with no read (mock, session not ready, permission place) stays plain', () => {
    expect(requestRead({ ...base, enabled: false, isFetching: true })).toBeUndefined();
  });
  it('checking only while the read runs or waits to run, never once data is there', () => {
    expect(requestRead({ ...base, isFetching: true })).toBe('checking');
    expect(requestRead(base)).toBe('checking');
    expect(requestRead({ ...base, hasData: true })).toBeUndefined();
    expect(requestRead({ ...base, hasData: true, isFetching: true })).toBeUndefined();
  });
  it('error once the read failed and nothing re-runs it; a retry in flight reads checking again', () => {
    expect(requestRead({ ...base, isError: true })).toBe('error');
    expect(requestRead({ ...base, isError: true, isFetching: true })).toBe('checking');
  });
});
