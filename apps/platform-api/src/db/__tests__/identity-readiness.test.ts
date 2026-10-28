// Unit tests for the 0076 readiness guard (#1100 a) against a fake pool, plus the boot-order pin:
// index.ts must run the guard before pg-boss or HTTP can start.

import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  IDENTITY_GUARD_FUNCTIONS,
  IDENTITY_MARKER,
  IdentityNotReadyError,
  assertPlatformIdentityReady,
} from '../identity-readiness.js';

const NEW_BODY =
  'IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = TG_RELID AND c.relowner = r.oid)';
const OLD_BODY = "IF current_user = 'fops_app' AND OLD.expires_at > statement_timestamp() THEN";

function poolWith(rows: Array<{ signature: string; marker: string | null; body: string }>) {
  return {
    query: (async () => ({
      rows,
      rowCount: rows.length,
      command: 'SELECT',
      oid: 0,
      fields: [],
    })) as pg.Pool['query'],
  } satisfies Pick<pg.Pool, 'query'>;
}
const guards = (patch: Partial<{ marker: string | null; body: string }> = {}, only?: number) =>
  IDENTITY_GUARD_FUNCTIONS.map((signature, i) => ({
    signature,
    marker: IDENTITY_MARKER,
    body: NEW_BODY,
    ...(only === undefined || only === i ? patch : {}),
  }));

describe('assertPlatformIdentityReady', () => {
  it('passes when all three guards carry the 0076 marker and the owner-based body', async () => {
    await expect(assertPlatformIdentityReady(poolWith(guards()))).resolves.toBeUndefined();
  });

  it('refuses a database that was role-renamed but not yet migrated by 0076 (old body, no marker)', async () => {
    const err = await assertPlatformIdentityReady(
      poolWith(guards({ marker: null, body: OLD_BODY })),
    ).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(IdentityNotReadyError);
    expect(err?.message).toMatch(/migration 0076/);
    expect(err?.message).not.toMatch(/postgres:|:\/\//);
  });

  it.each([
    ['one guard lacks the marker', guards({ marker: null }, 1)],
    ['a copied marker over an old body', guards({ body: OLD_BODY }, 2)],
    ['a guard function is missing', guards().slice(0, 2)],
    ['no rows at all', []],
  ])('refuses when %s', async (_name, rows) => {
    await expect(assertPlatformIdentityReady(poolWith(rows))).rejects.toBeInstanceOf(
      IdentityNotReadyError,
    );
  });

  it('keeps its marker identical to the migration comment text', () => {
    const sql = readFileSync(
      new URL('../../../migrations/0076_platform_identity_cutover.sql', import.meta.url),
      'utf8',
    );
    const comments = sql.match(/COMMENT ON FUNCTION [^\n]* IS '([^']*)'/g) ?? [];
    expect(comments).toHaveLength(IDENTITY_GUARD_FUNCTIONS.length);
    for (const comment of comments) expect(comment).toContain(`'${IDENTITY_MARKER}'`);
  });

  it('runs in index.ts after the role guard and before pg-boss starts', () => {
    const source = readFileSync(new URL('../../index.ts', import.meta.url), 'utf8');
    const role = source.indexOf('await assertRuntimeDbRole(');
    const ready = source.indexOf('await assertPlatformIdentityReady(');
    const boss = source.indexOf('await initBoss(');
    expect(role).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(role);
    expect(boss).toBeGreaterThan(ready);
  });
});
