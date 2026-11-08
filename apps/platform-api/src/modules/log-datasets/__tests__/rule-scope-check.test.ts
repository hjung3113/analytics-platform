import { describe, expect, it, vi } from 'vitest';

import { type RuleKeyChecker, unknownScopeRules } from '../rule-scope-check.js';

const checker = (answer: Awaited<ReturnType<RuleKeyChecker['checkRuleKeys']>>) => ({ checkRuleKeys: vi.fn().mockResolvedValue(answer) });
const run = (c: RuleKeyChecker | undefined, pin: string | undefined, scope: string[]) => unknownScopeRules(c, {} as never, 'ws', pin, scope);

describe('unknownScopeRules (#1496 R-f)', () => {
  it('refuses the ids the resolved Revision lacks, one field error each at the id index', async () => {
    const c = checker({ state: 'checked', missing: ['R-9', 'R-2'] });
    expect(await run(c, 'v3', ['R-1', 'R-2', 'R-3', 'R-9'])).toEqual([
      { path: ['expectedScope', '1'], code: 'unknown_rule' },
      { path: ['expectedScope', '3'], code: 'unknown_rule' },
    ]);
    expect(c.checkRuleKeys).toHaveBeenCalledWith({}, 'ws', 'v3', ['R-1', 'R-2', 'R-3', 'R-9']);
  });

  it('lists at most 10 and marks the cut', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `R-${i}`);
    const out = await run(checker({ state: 'checked', missing: ids }), 'v3', ids);
    expect(out).toHaveLength(11);
    expect(out[10]).toEqual({ path: ['expectedScope'], code: 'unknown_rule_truncated' });
  });

  it('accepts when everything exists', async () => {
    expect(await run(checker({ state: 'checked', missing: [] }), 'v3', ['R-1'])).toEqual([]);
  });

  it.each(['ambiguous', 'unknown', 'no_catalog'] as const)('accepts unchecked when the Revision is %s', async (reason) => {
    expect(await run(checker({ state: 'unresolved', reason }), 'v3', ['R-1'])).toEqual([]);
  });

  it('asks nothing without a pin, without ids or without a port', async () => {
    const c = checker({ state: 'checked', missing: ['R-1'] });
    expect(await run(c, undefined, ['R-1'])).toEqual([]);
    expect(await run(c, 'v3', [])).toEqual([]);
    expect(await run(undefined, 'v3', ['R-1'])).toEqual([]);
    expect(c.checkRuleKeys).not.toHaveBeenCalled();
  });
});
