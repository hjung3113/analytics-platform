import { describe, expect, it } from 'vitest';
import { executionKey, isAnchor, isInstant } from './endpoints';

describe('occurrence anchor syntax', () => {
  it.each(['0', '1', '2456001', '9223372036854775807', '9999999999999999999'])('accepts canonical decimal %s', value => {
    expect(isAnchor(value)).toBe(true);
  });

  it.each([null, '', '01', '-1', '+1', '1.5', '1e3', ' 1', 'abc', '2026-09-25T10:00:00', '12345678901234567890'])('rejects %s', value => {
    expect(isAnchor(value)).toBe(false);
  });

  it('keeps the wall-clock instant check separate from the key', () => {
    expect(isInstant('2026-09-25T10:00:00')).toBe(true);
    expect(isInstant('2456001')).toBe(false);
  });

  it('keys a row by equipment and anchor only', () => {
    expect(executionKey({ equipmentId: 'E1', anchor: '7' })).toBe('E1|7');
    expect(executionKey({ equipmentId: 'E2', anchor: '7' })).not.toBe(executionKey({ equipmentId: 'E1', anchor: '7' }));
  });
});
