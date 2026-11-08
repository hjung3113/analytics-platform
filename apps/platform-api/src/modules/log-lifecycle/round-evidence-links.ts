import { viewerOf } from '../log-knowledge/index.js';
// The Gate read port (#1466, ADR-0123): the 수동 검증 첨부 links of a Round, for the Gate's evidence snapshot (#1446).
// Same visibility as the Round: `platform:view` and the round in the actor's workspace; anything else answers `null`,
// never "no links", so a caller cannot tell an unreadable Round from an unknown one. A link is returned only while its
// attachment is still active under that Round (the attachment end's read judge is the round's, `roundAttachmentParent`).
// This function reads; it decides nothing about the Gate.

import type { Db } from '../../db/client.js';
import { listAttachmentsByParent } from '../attachments/index.js';
import { selectActiveLinksForEndpoint } from '../entity-links/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { type PlatformActor, holdsPlatformPermission } from '../platform-port/permissions.js';
import { roundInWorkspace } from './repositories/lifecycle-read.js';

export interface RoundEvidenceLink {
  linkId: string;
  attachmentId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  /** Who linked it (the actor of the attach), and when the link row was created (ISO). */
  linkedByActorId: string;
  linkedAt: string;
}

export async function readRoundEvidenceLinks(
  deps: { db: Db; checkService: CheckService },
  actor: PlatformActor,
  roundId: string,
): Promise<RoundEvidenceLink[] | null> {
  if (!(await holdsPlatformPermission(deps.checkService, actor, 'platform:view'))) return null;
  if (!(await roundInWorkspace(deps.db, actor.workspace_id, roundId, viewerOf(actor)))) return null;
  const [links, attachments] = await Promise.all([
    selectActiveLinksForEndpoint(deps.db, {
      workspaceId: actor.workspace_id,
      endpointType: 'validation_round',
      endpointId: roundId,
      side: 'target',
    }),
    listAttachmentsByParent(deps.db, {
      workspaceId: actor.workspace_id,
      parentKind: 'validation_round',
      parentId: roundId,
    }),
  ]);
  const byId = new Map(attachments.map((a) => [a.id, a]));
  const result: RoundEvidenceLink[] = [];
  for (const link of links) {
    if (link.source_type !== 'manual_validation_attachment' || link.relation_type !== 'evidence_of') continue;
    const attachment = byId.get(link.source_id);
    if (!attachment) continue;
    result.push({
      linkId: link.id,
      attachmentId: attachment.id,
      name: attachment.name,
      sizeBytes: attachment.sizeBytes,
      mimeType: attachment.mimeType,
      linkedByActorId: link.created_by,
      linkedAt: link.created_at.toISOString(),
    });
  }
  // selectActiveLinksForEndpoint is newest first; the snapshot reads oldest first, like the attachment list.
  return result.reverse();
}
