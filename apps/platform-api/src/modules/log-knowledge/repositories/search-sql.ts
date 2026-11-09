// SQL helpers shared by the search read, adapter, index and outbox files (#1594 A-Q1): one definition each, so the rule «a key
// matches as a whole or by its Event part (after the last `/`)» and the array/uuid casts cannot drift apart. Pure SQL fragments, no access rule.

import { type SQL, sql } from 'drizzle-orm';

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export const rowsOf = <T>(result: unknown): T[] => (result as { rows: T[] }).rows;

/** Rows a DELETE/UPDATE touched. */
export const rowCountOf = (result: unknown): number => (result as { rowCount?: number }).rowCount ?? 0;

export const uuidParam = (value: string): SQL => sql`${value}::uuid`;

export const uuidArray = (ids: readonly string[]): SQL => sql`ARRAY[${sql.join(ids.map((id) => uuidParam(id)), sql`, `)}]::uuid[]`;

export const textArray = (values: readonly string[]): SQL => (values.length === 0 ? sql`ARRAY[]::text[]` : sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`);

/** The Event part of a key column: everything after the last `/` (the whole key when it has none). `col` is a trusted SQL expression. */
export const eventPartSql = (col: string): SQL => sql`regexp_replace(${sql.raw(col)}, '^.*/', '')`;
