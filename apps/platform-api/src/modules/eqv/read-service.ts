// The approved read surface of the eqv module for other modules (#1656; docs/02-domain-module-boundaries.md «Approved cross-module
// surfaces»). The caller passes a workspace it has verified and owns the permission: the service decides none, so the Hub reads a
// published Layout Revision with its own model ACL and no `eqv:view`. It reads only; it never returns a draft or a Template.
import { layoutRevision } from '@eqv/core';

import type { Tx } from '../../db/tx.js';
import { checkEquipmentLayout, REVISION_PATTERN } from './domain/layout-checks.js';
import { getRevision, listPublishedRevisions } from './repositories/eqv-read.js';

/** The picker list holds at most this many Revisions (newest first). */
export const PUBLISHED_REVISION_LIST_MAX = 500;

export interface PublishedRevision {
  layoutId: string;
  revision: string;
  document: unknown;
  publishedAt: string;
}

export interface PublishedRevisionOption {
  layoutId: string;
  revision: string;
  publishedAt: string;
}

export interface EqvReadService {
  getPublishedRevision(tx: Tx, workspaceId: string, layoutId: string, revision: string): Promise<PublishedRevision | null>;
  listPublishedRevisions(tx: Tx, workspaceId: string): Promise<PublishedRevisionOption[]>;
}

/**
 * Same re-check as `eqv.promoteTemplate`: the stored document must validate and hash to the stored Revision. A mismatch is "not found"
 * plus a log line (ids only), never a document.
 */
export function createEqvReadService(log: (message: string) => void = (m) => console.error(m)): EqvReadService {
  return {
    async getPublishedRevision(tx, workspaceId, layoutId, revision) {
      if (!REVISION_PATTERN.test(revision)) return null;
      const row = await getRevision(tx, workspaceId, layoutId, revision);
      if (!row) return null;
      const checked = checkEquipmentLayout(layoutId, row.document, ['document']);
      if (!checked.ok || (await layoutRevision(checked.layout)) !== revision) {
        log(`eqv read-service: stored Revision ${layoutId} ${revision} failed its hash check in workspace ${workspaceId}`);
        return null;
      }
      return { layoutId: row.layoutId, revision: row.revision, document: checked.layout, publishedAt: row.publishedAt };
    },
    listPublishedRevisions: (tx, workspaceId) => listPublishedRevisions(tx, workspaceId, PUBLISHED_REVISION_LIST_MAX),
  };
}

export const eqvReadService: EqvReadService = createEqvReadService();
