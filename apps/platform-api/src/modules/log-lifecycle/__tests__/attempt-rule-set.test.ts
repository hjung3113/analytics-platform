import { describe, expect, it, vi } from 'vitest';

import { withAttemptRuleSets } from '../attempt-rule-set.js';

const attempt = (id: string, ruleSetRevision: string | null) => ({ id, ruleSetRevision }) as never;
const detail = (...attempts: unknown[]) => ({ id: 'req', attempts }) as never;
const matched = { state: 'matched', ruleSetKey: 'RS-A', revision: 'v2', isCurrent: false, status: 'active', resultRef: 'x', revisionDigest: 'd' };

describe('withAttemptRuleSets (#1496 R-f)', () => {
  it('carries each state per attempt; matched keeps only the display fields; no revision = null', async () => {
    const find = vi.fn(async (_tx: unknown, _ws: string, ref: string) =>
      ref === 'm' ? matched : ref === 'a' ? { state: 'ambiguous', count: 2 } : ref === 'u' ? { state: 'unknown' } : { state: 'no_catalog' },
    );
    const out = await withAttemptRuleSets({ findRuleSetRevision: find as never }, {} as never, 'ws', detail(attempt('1', 'm'), attempt('2', 'a'), attempt('3', 'u'), attempt('4', 'n'), attempt('5', null)));
    expect(out.attempts.map((a) => a.ruleSet)).toEqual([
      { state: 'matched', ruleSetKey: 'RS-A', revision: 'v2', isCurrent: false, status: 'active' },
      { state: 'ambiguous' },
      { state: 'unknown' },
      { state: 'no_catalog' },
      null,
    ]);
  });

  it('looks each distinct string up once and none for an attempt without one', async () => {
    const find = vi.fn(async () => matched);
    await withAttemptRuleSets({ findRuleSetRevision: find as never }, {} as never, 'ws', detail(attempt('1', 'm'), attempt('2', 'm'), attempt('3', null)));
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('a rejected lookup marks its attempts unavailable, keeps the others, and reports once', async () => {
    const find = vi.fn(async (_tx: unknown, _ws: string, ref: string) => {
      if (ref === 'bad') throw new Error('boom');
      return matched;
    });
    const onError = vi.fn();
    const out = await withAttemptRuleSets({ findRuleSetRevision: find as never }, {} as never, 'ws', detail(attempt('1', 'bad'), attempt('2', 'm'), attempt('3', 'bad')), onError);
    expect(out.attempts.map((a) => a.ruleSet)).toEqual([
      { state: 'unavailable' },
      { state: 'matched', ruleSetKey: 'RS-A', revision: 'v2', isCurrent: false, status: 'active' },
      { state: 'unavailable' },
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
