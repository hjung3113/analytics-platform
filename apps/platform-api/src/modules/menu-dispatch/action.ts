// `menuAction` judgment (real-server-checklist §3 «menuAction 판정 순서» 1–8, ADR-0054). Order is
// contract. Steps 1–2 need no database; permission is judged before the transaction (cheap refusal)
// and again on it after the (actor, key) advisory lock; replay precedes input values, so the same
// key with another input — an extra key included — is `error`, not `invalid`. Only an `ok` answer
// is recorded. The engine writes no audit row: the declaration's handler does, in the same transaction.

import { Buffer } from 'node:buffer';

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { hashRequestBody } from '../core/idempotency/canonicalize.js';
import { createIdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { MenuDispatchRegistry } from './registry.js';
import {
  type ActionAnswer,
  type ActionOutcome,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from './types.js';

/**
 * Stored-answer bound for a replay. An `ok` answer is recorded in full or not at all: when its JSON
 * exceeds this size the transaction rolls back and the answer is `error` (`response too large to
 * record`), because an `ok` that cannot replay would break step 5. A handler's `data` must fit.
 */
export const MENU_ACTION_REPLAY_MAX_BYTES = 128 * 1024;

export const REPLAY_TOO_LARGE_MESSAGE = 'response too large to record';

/** True when the answer is small enough for `core.idempotency_keys` to keep whole. */
export const fitsReplayRecord = (answer: unknown): boolean =>
  Buffer.byteLength(JSON.stringify(answer) ?? 'null', 'utf8') <= MENU_ACTION_REPLAY_MAX_BYTES;

class ReplayTooLargeError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export type ActionShape =
  | {
      ok: true;
      declaration: MenuActionDeclaration;
      input: Record<string, unknown>;
      expectedVersion: string | null;
      /** Raw `idempotencyKey` as sent; judged by step 2. */
      idempotencyKey: unknown;
    }
  | { ok: false; message: string };

const shapeFail = (message: string): ActionShape => ({ ok: false, message });

/** Step 1: request shape. DB-free. */
export function judgeActionShape(body: unknown, registry: MenuDispatchRegistry): ActionShape {
  if (!isPlain(body)) return shapeFail('Malformed menu action');
  const declaration = typeof body.action === 'string' ? registry.action(body.action) : undefined;
  if (!declaration) return shapeFail('Unknown action');
  const { spec } = declaration;
  const versioned = spec.concurrency === 'version';
  const allowed = ['action', 'context', 'input', 'idempotencyKey', ...(versioned ? ['expectedVersion'] : [])];
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) return shapeFail(`${spec.id}: unexpected request key ${key}`);
  }
  for (const key of ['context', 'input']) {
    if (!Object.hasOwn(body, key)) return shapeFail(`${spec.id} needs ${key}`);
  }
  // `scopeId` travels exactly when the action requires a scope, and a scope action is refused at registration.
  if (!isPlain(body.context) || Object.keys(body.context).length > 0) {
    return shapeFail(`${spec.id} takes no context`);
  }
  if (!isPlain(body.input)) return shapeFail(`${spec.id}: input must be an object`);
  if (versioned && typeof body.expectedVersion !== 'string') {
    return shapeFail(`${spec.id} needs expectedVersion`);
  }
  return {
    ok: true,
    declaration,
    input: body.input,
    expectedVersion: versioned ? (body.expectedVersion as string) : null,
    idempotencyKey: body.idempotencyKey,
  };
}

/** Step 2: the idempotency key. `null` = acceptable. */
export function judgeIdempotencyKey(key: unknown): FieldError | null {
  if (key === undefined || key === null || key === '') {
    return { path: ['idempotencyKey'], code: 'required' };
  }
  if (typeof key !== 'string' || !UUID.test(key)) {
    return { path: ['idempotencyKey'], code: 'malformed' };
  }
  return null;
}

export interface MenuActionEngineDeps {
  db: Db;
  registry: MenuDispatchRegistry;
}

export function createMenuActionEngine(deps: MenuActionEngineDeps) {
  const idempotency = createIdempotencyService();

  const answer = (
    correlationId: string,
    outcome: ActionOutcome,
    over: Partial<Omit<ActionAnswer, 'outcome' | 'correlationId'>> = {},
  ): ActionAnswer => ({
    outcome,
    data: null,
    version: null,
    fieldErrors: [],
    replayed: false,
    correlationId,
    ...over,
  });

  /** Steps 1–8. `body` is the parsed JSON (or `null` for malformed JSON). */
  async function run(actor: PlatformActor, body: unknown, correlationId: string): Promise<ActionAnswer> {
    const shape = judgeActionShape(body, deps.registry);
    if (!shape.ok) return answer(correlationId, 'error', { message: shape.message });
    const keyError = judgeIdempotencyKey(shape.idempotencyKey);
    if (keyError) return answer(correlationId, 'invalid', { fieldErrors: [keyError] });
    // The uuid column folds spelling, so lock, lookup and record all use one canonical spelling.
    const key = (shape.idempotencyKey as string).toLowerCase();
    const { declaration, input, expectedVersion } = shape;
    const { spec } = declaration;

    const forbidden = () =>
      answer(correlationId, 'forbidden', { message: `No permission ${spec.permission}` });
    // Step 3, before any lock: a caller without permission takes no lock and reads nothing.
    if (!(await declaration.authorize(actor, deps.db))) return forbidden();

    const requestHash = hashRequestBody({
      action: spec.id,
      workspaceId: actor.workspace_id,
      scopeId: null,
      expectedVersion,
      input,
    });

    try {
      return await deps.db.transaction(async (tx: Tx): Promise<ActionAnswer> => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${actor.actor_id}), hashtext(${key}))`,
        );
        // Judged on the transaction after the lock wait: a grant lost while queued writes nothing.
        if (!(await declaration.authorize(actor, tx))) return forbidden();

        // Step 5: replay.
        const hit = await idempotency.lookup(tx, actor.actor_id, key, requestHash);
        if (hit.kind === 'match') {
          return { ...(hit.body as ActionAnswer), replayed: true, correlationId };
        }
        if (hit.kind === 'mismatch') {
          return answer(correlationId, 'error', {
            message: 'idempotency_key_reuse',
            fieldErrors: [{ path: ['idempotencyKey'], code: 'idempotency_key_reuse' }],
          });
        }

        // Step 6: input values.
        const unexpected = Object.keys(input).filter((k) => !spec.inputKeys.includes(k));
        if (unexpected.length > 0) {
          return answer(correlationId, 'invalid', {
            fieldErrors: unexpected.map((k) => ({ path: [k], code: 'unexpected_field' })),
          });
        }
        const invalid = declaration.validate(input);
        if (invalid.length > 0) return answer(correlationId, 'invalid', { fieldErrors: invalid });

        // Step 7: version.
        if (spec.concurrency === 'version') {
          const current = await declaration.currentVersion?.(tx, actor, input);
          if (current === undefined) {
            throw new Error(`action ${spec.id}: concurrency 'version' without a currentVersion reader`);
          }
          // The read may have queued behind a writer; judge permission again before revealing anything.
          if (!(await declaration.authorize(actor, tx))) return forbidden();
          if (current === null) return answer(correlationId, 'not_found');
          if (current !== expectedVersion) {
            return answer(correlationId, 'conflict', { version: current });
          }
        }

        // Step 8: the write.
        const written = await declaration.handle(tx, actor, input, { correlationId });
        if (spec.concurrency === 'version' && typeof written.version !== 'string') {
          throw new Error(`action ${spec.id}: a versioned write must return the new version`);
        }
        const result = answer(correlationId, 'ok', { data: written.data ?? null, version: written.version });
        // Never answer `ok` for a write that cannot replay: roll the whole transaction back instead.
        if (!fitsReplayRecord(result)) throw new ReplayTooLargeError();
        await idempotency.record(tx, actor.actor_id, key, requestHash, 200, result, {
          responseBodyMaxBytes: MENU_ACTION_REPLAY_MAX_BYTES,
      });
      return result;
      });
    } catch (error) {
      if (error instanceof ReplayTooLargeError) {
        return answer(correlationId, 'error', { message: REPLAY_TOO_LARGE_MESSAGE });
      }
      // A DB-judged refusal thrown by the declaration: the transaction already rolled back.
      if (error instanceof MenuActionInvalidError) {
        return answer(correlationId, 'invalid', { fieldErrors: error.fieldErrors });
      }
      throw error;
    }
  }

  return { run };
}

export type MenuActionEngine = ReturnType<typeof createMenuActionEngine>;
