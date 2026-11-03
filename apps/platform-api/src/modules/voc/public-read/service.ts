// apps/platform-api/src/modules/voc/public-read/service.ts
//
// Read service for the public VOC projection (`GET /vocs/public`, `GET /vocs/public/:id`) and the
// public arm of the attachment download entitlement. Objects are built from the allowlist and
// parsed through the strict schemas in `@ap/feature-shared` (`vocs/public-view.ts`).
import {
  type PublicVocAttachment,
  type PublicVocListQuery,
  type PublicVocListResponse,
  type PublicVocView,
  publicVocListResponseSchema,
  publicVocViewSchema,
  reporterFacingStatusEnumSchema,
} from '@ap/feature-shared';

import type { Db } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import { decodeListCursor, encodeListCursor } from '../../../lib/list-cursor.js';
import type { ActorContextLite } from '../authorization.js';
import { mapAttachmentRow } from '../read/mappers.js';
import {
  selectAttachmentsForComments,
  selectVocAttachments,
} from '../read/repository-attachments.js';
import {
  type PublicVocRow,
  isPublicUpdatePubliclyReadable,
  isVocPubliclyReadable,
  selectPublicEntries,
  selectPublicVocById,
  selectPublicVocPage,
} from './repository.js';
import { resolvePublicReadRule } from './rule.js';

export interface VocPublicReadServiceDeps {
  db: Db;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toListItem(row: PublicVocRow) {
  return {
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    reporter_facing_status: reporterFacingStatusEnumSchema.parse(row.reporter_facing_status),
    managed_system: { id: row.managed_system_id, name: row.managed_system_name },
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    mine: row.mine === true,
  };
}

function toAttachment(row: Parameters<typeof mapAttachmentRow>[0]): PublicVocAttachment {
  const { uploaded_by_actor_id: _uploader, ...rest } = mapAttachmentRow(row);
  return rest;
}

export function createVocPublicReadService(deps: VocPublicReadServiceDeps) {
  async function listPublic(args: {
    actor: ActorContextLite;
    query: PublicVocListQuery;
  }): Promise<PublicVocListResponse> {
    const { actor, query } = args;
    const cursor = query.cursor === undefined ? undefined : decodeListCursor(query.cursor);
    const rule = await resolvePublicReadRule(deps.db, actor);
    const rows = await selectPublicVocPage(deps.db, {
      workspaceId: actor.workspace_id,
      rule,
      mine: query.mine,
      ...(query.managed_system_id === undefined ? {} : { managedSystemId: query.managed_system_id }),
      ...(query.q === undefined ? {} : { q: query.q }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return publicVocListResponseSchema.parse({
      items: pageRows.map(toListItem),
      page: {
        has_more: hasMore,
        ...(hasMore && last !== undefined
          ? { cursor: encodeListCursor({ timestamp: last.created_at_raw, id: last.id }) }
          : {}),
      },
    });
  }

  async function getPublicDetail(args: {
    actor: ActorContextLite;
    vocId: string;
  }): Promise<PublicVocView> {
    const { actor, vocId } = args;
    const rule = await resolvePublicReadRule(deps.db, actor);
    const row = await selectPublicVocById(deps.db, {
      workspaceId: actor.workspace_id,
      rule,
      vocId,
    });
    // Nonexistent, archived, other-workspace and invisible VOCs take this one path.
    if (!row) throw new HttpError('not_found.record', 'VOC not found');

    const [entries, bodyAttachments] = await Promise.all([
      selectPublicEntries(deps.db, { workspaceId: actor.workspace_id, vocId }),
      selectVocAttachments(deps.db, actor.workspace_id, vocId),
    ]);
    const entryAttachments = await selectAttachmentsForComments(
      deps.db,
      actor.workspace_id,
      entries.map((e) => e.id),
    );
    return publicVocViewSchema.parse({
      ...toListItem(row),
      description_rich_content: row.description_rich_content ?? null,
      entries: entries.map((e) => ({
        id: e.id,
        kind: 'public_update' as const,
        body_rich_content: e.body_rich_content,
        created_at: iso(e.created_at),
        attachments: (entryAttachments.get(e.id) ?? []).map(toAttachment),
      })),
      attachments: bodyAttachments.map(toAttachment),
    });
  }

  /**
   * Attachment entitlement for a public reader: the VOC body, or a bodied `public_update`, of a VOC
   * that passes the public read rule. Reporter replies and internal comments never qualify.
   */
  async function canReadPublicAttachment(args: {
    actor: ActorContextLite;
    parent: { vocId: string } | { commentKind: string; commentId: string };
  }): Promise<boolean> {
    const { actor, parent } = args;
    if ('commentKind' in parent && parent.commentKind !== 'public_update') return false;
    const rule = await resolvePublicReadRule(deps.db, actor);
    if ('vocId' in parent) {
      return isVocPubliclyReadable(deps.db, {
        workspaceId: actor.workspace_id,
        rule,
        vocId: parent.vocId,
      });
    }
    return isPublicUpdatePubliclyReadable(deps.db, {
      workspaceId: actor.workspace_id,
      rule,
      entryId: parent.commentId,
    });
  }

  return { listPublic, getPublicDetail, canReadPublicAttachment };
}

export type VocPublicReadService = ReturnType<typeof createVocPublicReadService>;
