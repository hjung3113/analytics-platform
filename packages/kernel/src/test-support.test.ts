import { describe, expect, it } from 'vitest';
import { testAdapter } from './test-support';

// PlatformAdapter.session() is a store snapshot: the same object until the session changes
// (packages/contracts/src/adapter.ts). The builder's default must honor that — one session per
// adapter, not per read.
describe('testAdapter default session identity (#265)', () => {
  it('returns the same session object per adapter and a fresh session per builder call', () => {
    const adapter = testAdapter();
    expect(adapter.session()).toBe(adapter.session());
    expect(testAdapter().session()).not.toBe(adapter.session());
  });
});
