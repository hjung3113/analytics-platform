import { sourceRecordQuerySchema, sourceRowSchema, sourceSampleSetSchema } from '@ap/contract-schemas';
import type { z } from 'zod/v4';
import { describe, expect, it } from 'vitest';

import type {
  SampleSet as MenuSampleSet,
  SourceQuery as MenuSourceQuery,
  SourceRow as MenuSourceRow,
} from '../../../../../../menus/log-dev/log-analysis/src/endpoints.js';

// The menu keeps hand copies of the SourceReadPort shapes (menus/log-dev/log-analysis/src/endpoints.ts). Menu types are erased at
// runtime, so each copy is held two ways: a compile-time identity with the server schema (typechecked by
// tsconfig.platform-tests.json) and a strict parse of a value typed as the menu copy (catches a server rename at test time).
// This file is outside tsconfig.json for the same reason as log-knowledge/__tests__/catalog-menu-drift.test.ts (it imports a menu).
// RecordsPage / WindowPage / SourceAnswer / PeriodsPage are not covered: the server defines no schema for the explorer's own
// answer envelope (`state`/`reason`/`label`), only for the port's `status` union, so there is nothing to compare them with.

type Identical<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertIdentical = <A, B>(_ok: Identical<A, B>) => undefined;
assertIdentical<MenuSourceRow, z.infer<typeof sourceRowSchema>>(true);
assertIdentical<MenuSampleSet, z.infer<typeof sourceSampleSetSchema>>(true);
assertIdentical<MenuSourceQuery, z.infer<typeof sourceRecordQuerySchema>>(true);

const row: MenuSourceRow = {
  fileRef: 'file-a',
  fileOrder: 1,
  line: 1,
  text: 'Module 1 Start',
  truncated: false,
  timestamp: '2026-11-08T09:00:01',
  timeReversal: false,
  synthetic: true,
};
const sampleSet: MenuSampleSet = { sourceOwner: 'synthetic-ok', files: [{ fileRef: 'file-a', order: 1, sha256: 'a'.repeat(64) }] };
const query: MenuSourceQuery = { text: 't', logType: 'l', module: 'm', event: 'e', context: { k: 'v' } };

describe('menu hand copies match the server SourceReadPort schemas', () => {
  it.each([
    ['SourceRow', sourceRowSchema, row],
    ['SampleSet', sourceSampleSetSchema, sampleSet],
    ['SourceQuery', sourceRecordQuerySchema, query],
  ])('%s: the menu value passes the strict server schema and has exactly its keys', (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
    expect(Object.keys(value).sort()).toEqual(Object.keys((schema as z.ZodObject).shape).sort());
  });

  it('a field the server does not know is refused (the copy cannot grow one silently)', () => {
    expect(sourceRowSchema.safeParse({ ...row, extra: 1 }).success).toBe(false);
  });
});
