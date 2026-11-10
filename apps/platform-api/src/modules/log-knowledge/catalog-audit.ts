// The audit row of a catalog write, shared by the catalog actions (#1194) and the catalog import apply (#1195 b).
// The caller owns the transaction: the row commits with the write it describes (FO ADR-0008).

import type { Tx } from '../../db/tx.js';
import { createAuditService } from '../core/audit/audit-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { CatalogKind, CatalogRow } from './repositories/catalog-write.js';

export const SUBJECT = {
  vendor: 'knowledge_vendor',
  process: 'knowledge_process',
  model: 'knowledge_model',
  software: 'knowledge_software',
} as const;

export const NOUN = { vendor: 'Vendor', process: 'Process', model: 'Model', software: 'Software version' } as const;

/** Set on writes that a catalog import caused. */
export interface ImportSource {
  importJobId: string;
  rowNo: number;
}

const audit = createAuditService();

export function recordCatalogAudit(
  tx: Tx,
  actor: PlatformActor,
  kind: CatalogKind,
  type: 'created' | 'updated' | 'deactivated' | 'reactivated',
  row: CatalogRow,
  changes?: Record<string, [unknown, unknown]>,
  source?: ImportSource,
) {
  return audit.record(tx, {
    workspace_id: actor.workspace_id,
    actor_id: actor.actor_id,
    event_type: `knowledge.catalog.${type}`,
    subject_type: SUBJECT[kind],
    subject_id: row.id,
    summary: `${NOUN[kind]} ${row.code} ${type}`,
    detail: { code: row.code, name: row.name, ...(changes ? { changes } : {}), ...(source ? { source } : {}) },
  });
}

export function recordIdentityMapped(
  tx: Tx,
  actor: PlatformActor,
  kind: CatalogKind,
  target: CatalogRow,
  identity: { sourceSystem: string; sourceType: string; externalKey: string },
  source: ImportSource,
) {
  return audit.record(tx, {
    workspace_id: actor.workspace_id,
    actor_id: actor.actor_id,
    event_type: 'knowledge.catalog.identity_mapped',
    subject_type: SUBJECT[kind],
    subject_id: target.id,
    summary: `${NOUN[kind]} ${target.code} identity mapped`,
    detail: { ...identity, source },
  });
}
