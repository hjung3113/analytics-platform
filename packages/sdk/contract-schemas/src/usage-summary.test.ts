import type { UsageSummary } from '@ap/contracts';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { usageSummarySchema } from './index.ts';

const legacy = { preset: 'all' as const, menus: [{ menuId: 'synthetic-menu', visits: 1, distinctUsers: 1, lastUsedAt: 1 }] };
const diagnostic = { menuId: 'synthetic-menu', permission: 'synthetic:missing', reason: 'Permission is not declared on the server.' };

describe('usage summary diagnostics (#1846)', () => {
  it('accepts the old response with no diagnostic or optional rates', () => {
    expect(usageSummarySchema.parse(legacy)).toEqual(legacy);
  });
  it('preserves optional diagnostic rows', () => {
    const response = { ...legacy, undeclaredMenuPermissions: [diagnostic] };
    expect(usageSummarySchema.parse(response)).toEqual(response);
  });
  it.each(['menuId', 'permission', 'reason'])('requires diagnostic %s', (key) => {
    const row: Record<string, string> = { ...diagnostic };
    delete row[key];
    expect(usageSummarySchema.safeParse({ ...legacy, undeclaredMenuPermissions: [row] }).success).toBe(false);
  });
  it('matches the shared adapter response type', () => {
    expectTypeOf<z.infer<typeof usageSummarySchema>>().toEqualTypeOf<UsageSummary>();
  });
});
