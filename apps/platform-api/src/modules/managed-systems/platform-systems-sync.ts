// Startup sync of registry-owned Managed Systems (#1289 node i, ADR-0110 decision 5).
//
// Ensures, idempotently and in one transaction under an advisory lock:
//   * the 「플랫폼」 system (external_key `platform`), and
//   * one Managed System per business system that declares `feedbackTracking` (external_key `space:<space id>`),
//     read from the committed `platform-systems.json` (PLATFORM_SYSTEMS_FILE).
// `core.space_links` records the space → system link. It is navigation/default metadata only: no permission check
// reads it (ADR-0068 decision 1).
//
// Never adopts a manual row (a row without the registry-owned key is reported as a conflict and skipped), never
// archives, and never throws on a missing/invalid file or a missing workspace/system actor — the server starts and the
// next start (or `bootstrap` + backend restart) retries. A missing, unreadable or invalid file is an error state, not an
// empty declaration: it leaves existing links untouched. Only a valid file marks links it no longer lists undeclared.

import { readFile } from 'node:fs/promises';

import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import type { DatabaseError } from 'pg';

import { type PlatformSystem, platformSystemsFileSchema } from '@ap/feature-shared';

import type { Db } from '../../db/client.js';
import { actors, managedSystems, workspaces } from '../../db/schema/core.js';
import { spaceLinks } from '../../db/schema/space-links.js';
import type { Tx } from '../../db/tx.js';
import type { JobLog } from '../../lib/job-log.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { MS_SLUG_REGEX } from './managed-system-service.js';
import {
  PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY,
  SPACE_EXTERNAL_KEY_PREFIX,
  lockPlatformSystemsSync,
} from './registry-keys.js';

export const PLATFORM_SYSTEM_SLUG = 'platform';
export const PLATFORM_SYSTEM_NAME = '플랫폼';
const SYSTEM_ACTOR_EXTERNAL_ID = 'system';

export type DeclarationOutcome =
  | { kind: 'ok'; systems: readonly PlatformSystem[] }
  /** PLATFORM_SYSTEMS_FILE unset, or the file does not exist. */
  | { kind: 'absent' }
  /** Unreadable, not JSON, or failing the shared schema. */
  | { kind: 'invalid' };

/** Reads and validates the declaration file. Logs one error for an invalid file; never throws, never logs contents. */
export async function readPlatformSystemsFile(
  path: string | undefined,
  log: JobLog,
): Promise<DeclarationOutcome> {
  if (path === undefined || path === '') {
    log.warn('platform systems sync: PLATFORM_SYSTEMS_FILE is not set; only the platform system is ensured');
    return { kind: 'absent' };
  }
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      log.warn('platform systems sync: declaration file not found; only the platform system is ensured');
      return { kind: 'absent' };
    }
    log.error('platform systems sync: declaration file unreadable; nothing registered from it', {
      errName: err instanceof Error ? err.name : 'unknown',
      code: (err as NodeJS.ErrnoException).code,
    });
    return { kind: 'invalid' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    log.error('platform systems sync: declaration file is not valid JSON; nothing registered from it');
    return { kind: 'invalid' };
  }
  const parsed = platformSystemsFileSchema.safeParse(json);
  if (!parsed.success) {
    log.error('platform systems sync: declaration file failed its schema; nothing registered from it', {
      issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.')),
    });
    return { kind: 'invalid' };
  }
  return { kind: 'ok', systems: parsed.data.systems };
}

export type SyncSkipReason = 'no_workspace' | 'no_system_actor';

export interface PlatformSystemsSyncResult {
  skipped?: SyncSkipReason;
  declaration: DeclarationOutcome['kind'];
  /** Slugs inserted this run. */
  registered: string[];
  /** Slugs whose name changed this run. */
  renamed: string[];
  /** Slugs held by a manual row (no registry-owned key) or otherwise unusable; nothing was written for them. */
  conflicts: string[];
}

export interface PlatformSystemsSyncDeps {
  db: Db;
  auditService: AuditService;
  log: JobLog;
  workspaceId: string;
  /** PLATFORM_SYSTEMS_FILE. */
  filePath: string | undefined;
}

type ManagedSystemRow = typeof managedSystems.$inferSelect;

async function findActiveByKey(tx: Tx, workspaceId: string, key: string) {
  const rows = await tx
    .select()
    .from(managedSystems)
    .where(
      and(
        eq(managedSystems.workspaceId, workspaceId),
        eq(managedSystems.externalKey, key),
        isNull(managedSystems.archivedAt),
      ),
    )
    .limit(1);
  return rows[0];
}

async function slugIsTaken(tx: Tx, workspaceId: string, slug: string): Promise<boolean> {
  const rows = await tx
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      and(
        eq(managedSystems.workspaceId, workspaceId),
        eq(managedSystems.slug, slug),
        isNull(managedSystems.archivedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export function createPlatformSystemsSync(deps: PlatformSystemsSyncDeps) {
  const { db, auditService, log, workspaceId } = deps;

  /** Inserts a registry-owned row inside a savepoint; a concurrent manual register of the same slug returns null. */
  async function insertOwned(
    tx: Tx,
    actorId: string,
    values: { slug: string; name: string; externalKey: string },
  ): Promise<ManagedSystemRow | null> {
    try {
      return await tx.transaction(async (sp) => {
        const rows = await sp
          .insert(managedSystems)
          .values({ workspaceId, ...values })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('managed_systems insert returned no row');
        await auditService.record(sp, {
          workspace_id: workspaceId,
          actor_id: actorId,
          event_type: 'managed_system_registered',
          subject_type: 'managed_system',
          subject_id: row.id,
          summary: `Managed System registered: ${row.slug}`,
          detail: {
            slug: row.slug,
            name: row.name,
            external_key: row.externalKey,
            default_owner_actor_id: null,
            default_owner_team_id: null,
            default_reviewer_actor_id: null,
            default_reviewer_team_id: null,
          },
        });
        return row;
      });
    } catch (err) {
      if ((err as DatabaseError)?.code === '23505') return null;
      throw err;
    }
  }

  async function ensureOwned(
    tx: Tx,
    actorId: string,
    spec: { slug: string; name: string; externalKey: string },
    result: PlatformSystemsSyncResult,
  ): Promise<ManagedSystemRow | null> {
    const existing = await findActiveByKey(tx, workspaceId, spec.externalKey);
    if (existing) {
      if (existing.name === spec.name) return existing;
      const [updated] = await tx
        .update(managedSystems)
        .set({ name: spec.name, updatedAt: new Date() })
        .where(and(eq(managedSystems.workspaceId, workspaceId), eq(managedSystems.id, existing.id)))
        .returning();
      if (!updated) throw new Error('managed_systems update returned no row');
      await auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actorId,
        event_type: 'managed_system_updated',
        subject_type: 'managed_system',
        subject_id: existing.id,
        summary: `Managed System updated: ${existing.slug}`,
        detail: {
          managed_system_id: existing.id,
          changes: { name: { from: existing.name, to: spec.name } },
        },
      });
      result.renamed.push(existing.slug);
      return updated;
    }
    if (!MS_SLUG_REGEX.test(spec.slug) || (await slugIsTaken(tx, workspaceId, spec.slug))) {
      // A manual row (or an unusable id) holds the slug: never adopted, never overwritten.
      log.warn('platform systems sync: slug unavailable; not registered', { slug: spec.slug });
      result.conflicts.push(spec.slug);
      return null;
    }
    const inserted = await insertOwned(tx, actorId, spec);
    if (!inserted) {
      log.warn('platform systems sync: slug taken concurrently; not registered', { slug: spec.slug });
      result.conflicts.push(spec.slug);
      return null;
    }
    result.registered.push(inserted.slug);
    return inserted;
  }

  async function run(): Promise<PlatformSystemsSyncResult> {
    const declaration = await readPlatformSystemsFile(deps.filePath, log);
    const result: PlatformSystemsSyncResult = {
      declaration: declaration.kind,
      registered: [],
      renamed: [],
      conflicts: [],
    };

    await db.transaction(async (tx) => {
      await lockPlatformSystemsSync(tx, workspaceId);

      const [workspace] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (!workspace) {
        log.warn('platform systems sync skipped: workspace not found; restart the backend after bootstrap');
        result.skipped = 'no_workspace';
        return;
      }
      const [systemActor] = await tx
        .select({ id: actors.id })
        .from(actors)
        .where(
          and(eq(actors.workspaceId, workspaceId), eq(actors.externalId, SYSTEM_ACTOR_EXTERNAL_ID)),
        )
        .limit(1);
      if (!systemActor) {
        log.warn('platform systems sync skipped: system actor not found; restart the backend after bootstrap');
        result.skipped = 'no_system_actor';
        return;
      }

      await ensureOwned(
        tx,
        systemActor.id,
        {
          slug: PLATFORM_SYSTEM_SLUG,
          name: PLATFORM_SYSTEM_NAME,
          externalKey: PLATFORM_MANAGED_SYSTEM_EXTERNAL_KEY,
        },
        result,
      );

      if (declaration.kind !== 'ok') return;

      const now = new Date();
      for (const system of declaration.systems) {
        const row = await ensureOwned(
          tx,
          systemActor.id,
          {
            slug: system.space_id,
            name: system.name,
            externalKey: `${SPACE_EXTERNAL_KEY_PREFIX}${system.space_id}`,
          },
          result,
        );
        if (!row) continue;
        await tx
          .insert(spaceLinks)
          .values({
            workspaceId,
            spaceId: system.space_id,
            managedSystemId: row.id,
            declared: true,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [spaceLinks.workspaceId, spaceLinks.spaceId],
            set: { managedSystemId: row.id, declared: true, updatedAt: now },
          });
      }

      // Only a valid file speaks for "no longer declared"; a valid empty list marks every link undeclared.
      const declaredIds = declaration.systems.map((system) => system.space_id);
      await tx
        .update(spaceLinks)
        .set({ declared: false, updatedAt: now })
        .where(
          and(
            eq(spaceLinks.workspaceId, workspaceId),
            eq(spaceLinks.declared, true),
            declaredIds.length > 0 ? notInArray(spaceLinks.spaceId, declaredIds) : sql`true`,
          ),
        );
    });

    log.info('platform systems sync finished', {
      skipped: result.skipped,
      declaration: result.declaration,
      registered: result.registered.length,
      renamed: result.renamed.length,
      conflicts: result.conflicts.length,
    });
    return result;
  }

  return { run };
}

export type PlatformSystemsSync = ReturnType<typeof createPlatformSystemsSync>;
