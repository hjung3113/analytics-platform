import { describe, expect, it } from 'vitest';
import { ContractError, formatInstant } from '@ap/contracts';

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ContractError ? e.code : 'other'; } return 'ok'; };

// The mirror of url-contract's time tests: formatDateTime prints §6.3 naive wall-clock digits as stored;
// formatInstant renders a real instant (epoch ms / offset ISO-8601) in the viewer's time zone.
describe('formatInstant (real instants)', () => {
  it('renders an epoch ms / Z instant in the requested time zone, not the UTC digits', () => {
    expect(formatInstant(1_790_560_800_000, 'en', 'Asia/Seoul')).toContain('11:00');
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'Asia/Seoul')).toContain('11:00');
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'Asia/Seoul')).not.toContain('02:00');
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'UTC')).toContain('2:00');
  });
  it('accepts an explicit numeric offset as an instant', () => {
    expect(formatInstant('2026-09-26T11:00:00+09:00', 'en', 'Asia/Seoul')).toContain('11:00');
  });
  it('fails closed on naive wall-clock, which is formatDateTime\'s domain', () => {
    expect(code(() => formatInstant('2026-09-26T02:00:00', 'en'))).toBe('invalid_time');
  });
  it('localizes ko and en differently', () => {
    expect(formatInstant('2026-09-26T02:00:00.000Z', 'ko', 'Asia/Seoul'))
      .not.toBe(formatInstant('2026-09-26T02:00:00.000Z', 'en', 'Asia/Seoul'));
  });
});
