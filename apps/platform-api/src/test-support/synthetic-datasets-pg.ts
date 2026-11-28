/**
 * PostgreSQL loader for the synthetic analysis datasets (#3204 slice 3): puts one generated dataset into its own schema
 * so an engine test runs SQL over the same logical rows every other engine gets (#1704 minimal contract tests, #2918
 * measurements). Test code only; it never touches the product tables. Expected values never come from here: a test
 * computes them from the generated rows (`docs/integration/synthetic-dataset-engines.md`).
 *
 * Columns are declared per table, not inferred: a dataset row field without a column (or a column without a field)
 * fails `columnsFor` before any SQL runs, so a generator change cannot load half a table silently.
 *
 * No import of `@ap/server-conformance`: the image build compiles this file and installs that package from its manifest
 * only (`src/__tests__/image-build-tsconfig.test.ts`). `SyntheticTables` is the structural part of its `SyntheticDataset`
 * the loader reads; the unit test passes real generated datasets, so the shapes stay checked.
 */

/** What the loader reads from a generated dataset (`@ap/server-conformance/datasets` `SyntheticDataset`). */
export type SyntheticTables = { dataset: string; tables: Readonly<Record<string, ReadonlyArray<Readonly<Record<string, unknown>>>>> };

/** The part of a pg `Pool`/`Client` the loader uses. */
export type Queryable = { query: (text: string, values?: unknown[]) => Promise<unknown> };

type SqlType = 'text' | 'integer' | 'bigint' | 'double precision' | 'timestamptz';

/**
 * Field → SQL type of every table. Instants are `timestamptz` (the generator writes UTC ISO strings); `elapsed` is
 * `bigint` because it may be milliseconds; measures that can be fractional are `double precision`. No primary or foreign
 * keys: the datasets carry repeated keys, revisions and unresolved relations on purpose.
 */
const COLUMNS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, SqlType>>>>>> = {
  'interval-steps': {
    runs: { runId: 'text', revision: 'integer', subjectKey: 'text', startAt: 'timestamptz', endAt: 'timestamptz', loadedAt: 'timestamptz', quantity: 'double precision', elapsed: 'bigint', elapsedUnit: 'text' },
    steps: { stepId: 'text', runId: 'text', startAt: 'timestamptz', endAt: 'timestamptz', amount: 'double precision' },
  },
  'shared-resource': {
    events: { eventId: 'text', resourceKey: 'text', startAt: 'timestamptz', endAt: 'timestamptz' },
    links: { eventId: 'text', objectKey: 'text' },
  },
};

const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
/** Rows per INSERT: well under PostgreSQL's 65 535 bind parameters for the widest table (9 columns). */
const BATCH_ROWS = 500;

/** `startAt` → `start_at`. */
export const columnName = (field: string): string => field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** The declared columns of `table`, checked against the fields its rows actually carry. */
export function columnsFor(data: SyntheticTables, table: string): Array<[field: string, type: SqlType]> {
  const declared = COLUMNS[data.dataset]?.[table];
  if (declared === undefined) throw new Error(`synthetic-datasets-pg: no columns declared for ${data.dataset}.${table}`);
  const rows = data.tables[table] ?? [];
  const fields = new Set(rows.flatMap((row) => Object.keys(row)));
  const missing = [...fields].filter((field) => !(field in declared));
  const unused = Object.keys(declared).filter((field) => rows.length > 0 && !fields.has(field));
  if (missing.length || unused.length) {
    throw new Error(`synthetic-datasets-pg: ${data.dataset}.${table} columns drifted from the generator (no column: ${missing.join(', ') || '-'}; no field: ${unused.join(', ') || '-'})`);
  }
  return Object.entries(declared);
}

function assertSchema(schema: string): void {
  if (!SCHEMA_NAME.test(schema) || schema === 'public' || schema.startsWith('pg_')) {
    throw new Error(`synthetic-datasets-pg: refusing schema name ${JSON.stringify(schema)} (lower-case identifier, not public or pg_*)`);
  }
}

/**
 * Creates `schema` (it must not exist) and one table per dataset table, then inserts every row, in one transaction.
 * Returns the row count per table.
 */
export async function loadSyntheticDataset(client: Queryable, data: SyntheticTables, schema: string): Promise<Record<string, number>> {
  assertSchema(schema);
  const tables = Object.entries(data.tables);
  const plan = tables.map(([table, rows]) => ({ table, rows, columns: columnsFor(data, table) }));
  const counts: Record<string, number> = {};
  await client.query('BEGIN');
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    for (const { table, rows, columns } of plan) {
      await client.query(`CREATE TABLE "${schema}"."${table}" (${columns.map(([field, type]) => `"${columnName(field)}" ${type}`).join(', ')})`);
      for (let start = 0; start < rows.length; start += BATCH_ROWS) {
        const batch = rows.slice(start, start + BATCH_ROWS);
        const values = batch.flatMap((row) => columns.map(([field]) => row[field] ?? null));
        const tuples = batch.map((_, r) => `(${columns.map((_column, c) => `$${r * columns.length + c + 1}`).join(', ')})`);
        await client.query(`INSERT INTO "${schema}"."${table}" (${columns.map(([field]) => `"${columnName(field)}"`).join(', ')}) VALUES ${tuples.join(', ')}`, values);
      }
      counts[table] = rows.length;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return counts;
}

/** Drops a schema the loader made, with its tables. */
export async function dropSyntheticSchema(client: Queryable, schema: string): Promise<void> {
  assertSchema(schema);
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}
