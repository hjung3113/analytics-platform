import { describe, expect, it } from 'vitest';

import { listLimitSchema } from '../list-page.js';
import { listFindingsQuerySchema } from '../findings/index.js';
import { listTaskRequestsQuerySchema } from '../task-requests/index.js';
import { listTasksQuerySchema } from '../tasks/index.js';

describe('shared list limit', () => {
  it('defaults to 50 and accepts 1..100', () => {
    expect(listLimitSchema.parse(undefined)).toBe(50);
    expect(listLimitSchema.parse('1')).toBe(1);
    expect(listLimitSchema.parse('100')).toBe(100);
  });

  it.each(['0', '101', '1.5', '-1', 'abc'])('rejects %s', (value) => {
    expect(listLimitSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ['tasks', listTasksQuerySchema],
    ['task requests', listTaskRequestsQuerySchema],
    ['findings', listFindingsQuerySchema],
  ] as const)('%s list query defaults to 50 and rejects 101', (_name, schema) => {
    expect(schema.parse({}).limit).toBe(50);
    expect(schema.parse({ limit: '100' }).limit).toBe(100);
    expect(schema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
