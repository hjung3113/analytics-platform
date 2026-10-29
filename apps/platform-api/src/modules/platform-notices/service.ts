// Notice management and the Home projection (ADR-0098 §4, ADR-0095 §1). Write order, which is part
// of the contract: console permission → request shape and header consistency → (transaction)
// advisory lock on (actor, key) → `console:access` judged again on the transaction → replay lookup →
// object lock → `console:access` judged again → not_found / version → write → record the `ok` answer.
// Permission precedes replay and object lookup, and is re-judged after each wait that can queue
// behind another transaction, so neither a replay nor a conflict reveals data after access loss,
// and a grant lost while queued writes nothing. Only successful answers are recorded; a conflict / not_found / invalid is
// never cached. Core's idempotency table and 24 h purge are reused with a finite response bound
// (`NOTICE_REPLAY_MAX_BYTES`) because a legal bilingual answer can exceed Core's 16 KiB default.

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import { createIdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { type PlatformActor, holdsPlatformPermission } from '../platform-port/permissions.js';
import { seoulWallClock } from '../platform-port/seoul-clock.js';
import {
  deleteNotice,
  insertNotice,
  listGlobalNotices,
  listHomeNotices,
  lockNotice,
  toNotice,
  updateNotice,
} from './notice-store.js';
import {
  type NoticeOperation,
  type NoticeWriteHeaders,
  isUuid,
  parseNoticeWrite,
} from './parse-write.js';
import type { ActionAnswer, FieldError, HomeNotice, Notice } from './types.js';
import { versionOf } from './types.js';

/**
 * Stored-answer bound for a notice write. The schema bounds a bilingual notice to 2 × (200 + 10 000)
 * UTF-16 units; a JSON string escapes at most 6 bytes per unit, so the worst legal answer is about
 * 123 KB, below this 128 KiB. Core's default (16 KiB) is unchanged for every other caller.
 */
export const NOTICE_REPLAY_MAX_BYTES = 128 * 1024;

export interface NoticeListResult {
  outcome: 'ok' | 'empty' | 'forbidden';
  data: { items: Notice[] } | null;
  message?: string;
}

export type HomeNoticesResult =
  | { outcome: 'ok'; data: HomeNotice[] }
  | { outcome: 'empty'; data: null };

export interface NoticeWriteRequest {
  operation: NoticeOperation;
  body: unknown;
  headers: NoticeWriteHeaders;
  correlationId: string;
}

export interface NoticeServiceDeps {
  db: Db;
  checkService: CheckService;
  now?: () => Date;
}

type Answer = ActionAnswer<Notice> | ActionAnswer<{ id: string }>;

export function createPlatformNoticeService(deps: NoticeServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const idempotency = createIdempotencyService();

  const answer = <T>(
    correlationId: string,
    outcome: ActionAnswer<T>['outcome'],
    over: Partial<ActionAnswer<T>> = {},
  ): ActionAnswer<T> => ({
    outcome,
    data: null,
    version: null,
    fieldErrors: [],
    replayed: false,
    correlationId,
    ...over,
  });

  async function list(actor: PlatformActor): Promise<NoticeListResult> {
    if (!(await holdsPlatformPermission(deps.checkService, actor, 'notice:view'))) {
      return { outcome: 'forbidden', data: null, message: 'No permission notice:view' };
    }
    const items = await listGlobalNotices(deps.db, actor.workspace_id);
    return items.length === 0
      ? { outcome: 'empty', data: null }
      : { outcome: 'ok', data: { items } };
  }

  /** `home.notices`: exact target, unexpired at Seoul wall-clock second precision, workspace of the session. */
  async function homeNotices(
    actor: PlatformActor,
    targetScopeId: string | null,
  ): Promise<HomeNoticesResult> {
    const rows = await listHomeNotices(
      deps.db,
      actor.workspace_id,
      targetScopeId,
      seoulWallClock(now()),
    );
    return rows.length === 0 ? { outcome: 'empty', data: null } : { outcome: 'ok', data: rows };
  }

  async function write(actor: PlatformActor, request: NoticeWriteRequest): Promise<Answer> {
    const { correlationId } = request;
    if (!(await holdsPlatformPermission(deps.checkService, actor, 'console:access'))) {
      return answer(correlationId, 'forbidden', { message: 'No permission console:access' });
    }
    const judged = parseNoticeWrite(request.operation, request.body, request.headers);
    if (!judged.ok) {
      return answer(correlationId, judged.outcome, {
        fieldErrors: judged.fieldErrors,
        message: judged.message,
      });
    }
    const { input } = judged;
    const operation = input.kind === 'delete' ? 'notice.delete' : 'notice.save';
    const requestHash = hashRequestBody({
      operation,
      workspaceId: actor.workspace_id,
      input: judged.fingerprintInput,
    });

    // Judged on the transaction handle, after a lock wait: a grant revoked, denied or expired while
    // this request queued is seen here. The early check above only orders permission before parsing.
    const stillHoldsConsole = (tx: Tx) =>
      holdsPlatformPermission(deps.checkService, actor, 'console:access', { tx });
    const refused = () =>
      answer<Notice>(correlationId, 'forbidden', { message: 'No permission console:access' });

    return deps.db.transaction(async (tx): Promise<Answer> => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${actor.actor_id}), hashtext(${input.idempotencyKey}))`,
      );
      if (!(await stillHoldsConsole(tx))) return refused();
      const hit = await idempotency.lookup(tx, actor.actor_id, input.idempotencyKey, requestHash);
      if (hit.kind === 'match') {
        return { ...(hit.body as Answer), replayed: true, correlationId };
      }
      if (hit.kind === 'mismatch') {
        return answer(correlationId, 'invalid', {
          fieldErrors: [{ path: ['idempotencyKey'], code: 'reused' }] satisfies FieldError[],
        });
      }

      async function apply(): Promise<Answer> {
        if (input.kind === 'create') {
          const row = await insertNotice(tx, actor.workspace_id, actor.actor_id, input.draft);
          const notice = toNotice(row);
          return answer<Notice>(correlationId, 'ok', { data: notice, version: notice.version });
        }
        // A non-UUID id can never name a row; never let it reach a uuid cast.
        const current = isUuid(input.id)
          ? await lockNotice(tx, actor.workspace_id, input.id)
          : null;
        // The row lock may have queued behind another writer; judge again before revealing anything.
        if (!(await stillHoldsConsole(tx))) return refused();
        if (!current) return answer(correlationId, 'not_found');
        const currentVersion = versionOf(current.revision);
        if (currentVersion !== input.expectedVersion) {
          return answer(correlationId, 'conflict', { version: currentVersion });
        }
        if (input.kind === 'delete') {
          await deleteNotice(tx, current);
          return answer<{ id: string }>(correlationId, 'ok', {
            data: { id: current.id },
            version: currentVersion,
          });
        }
        const notice = toNotice(await updateNotice(tx, current, input.draft));
        return answer<Notice>(correlationId, 'ok', { data: notice, version: notice.version });
      }

      const result = await apply();
      if (result.outcome === 'ok') {
        await idempotency.record(
          tx,
          actor.actor_id,
          input.idempotencyKey,
          requestHash,
          200,
          result,
          {
            responseBodyMaxBytes: NOTICE_REPLAY_MAX_BYTES,
          },
        );
      }
      return result;
    });
  }

  return { list, homeNotices, write };
}

export type PlatformNoticeService = ReturnType<typeof createPlatformNoticeService>;
