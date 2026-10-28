// Runtime readiness for the platform identity cutover (#1100 a, migration 0076).
//
// The roles are renamed in place before migration 0076 runs. Between the rename and 0076 the three
// persisted delete guards still compare current_user to the old role name, so they would never
// fire for platform_app. The server and jobs therefore refuse to start unless the connected
// database shows that 0076 committed. The runtime role cannot read the migration ledger and must
// not be granted it, so the proof is catalog-visible: 0076 comments the three rebuilt guard
// functions in the same transaction that replaces their bodies. The check also re-reads the
// bodies, so a copied comment alone does not pass.

import type pg from 'pg';

// Keep identical to the COMMENT text in migrations/0076_platform_identity_cutover.sql.
export const IDENTITY_MARKER = 'platform identity 0076: owner-based delete guard';

export const IDENTITY_GUARD_FUNCTIONS = [
  'voc.guard_cluster_suggestion_bucket_delete()',
  'voc.guard_similarity_preview_request_delete()',
  'voc.guard_similarity_preview_budget_delete()',
] as const;

interface GuardRow {
  signature: string;
  marker: string | null;
  body: string;
}

export class IdentityNotReadyError extends Error {
  override readonly name = 'IdentityNotReadyError';
}

export async function assertPlatformIdentityReady(pool: Pick<pg.Pool, 'query'>): Promise<void> {
  const { rows } = await pool.query<GuardRow>(
    `select s.signature,
            pg_catalog.obj_description(to_regprocedure(s.signature)::oid, 'pg_proc') as marker,
            coalesce(p.prosrc, '') as body
       from pg_catalog.unnest($1::text[]) as s(signature)
       left join pg_catalog.pg_proc p on p.oid = to_regprocedure(s.signature)`,
    [[...IDENTITY_GUARD_FUNCTIONS]],
  );
  const notReady = rows.filter(
    (row) =>
      row.marker !== IDENTITY_MARKER ||
      row.body.includes('fops_') ||
      !row.body.includes('relowner'),
  );
  if (rows.length !== IDENTITY_GUARD_FUNCTIONS.length || notReady.length > 0) {
    throw new IdentityNotReadyError(
      'database is not ready: migration 0076 (platform identity cutover) is not committed; ' +
        'run ops/platform-api/scripts/db/cutover-0076-platform-identity.sh before starting the backend',
    );
  }
}
