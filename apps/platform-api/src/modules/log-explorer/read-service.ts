// The four log-explorer reads (#1469, design §3.1/§4/§5), run per request: judge the right (capability and Source owner), ask the
// guarded Source port under the client's AbortSignal and the time budget, answer a STATE (never a fake result) for `partial`,
// `truncated`, `unsupported`, `permission_denied` and `source_absent`, judge the right again before the text leaves, and audit
// without any body. The platform stores none of the answered text. Order is the Source's file order then line; nothing re-sorts.

import { createHash } from 'node:crypto';

import {
  SOURCE_READ_TIME_BUDGET_MS,
  type SourceParsedResponse,
  type SourcePeriodsResponse,
  type SourceRecordQuery,
  type SourceSampleSet,
  type SourceSearchResponse,
  type SourceWindowResponse,
} from '@ap/contract-schemas';
import type { LOG_EXPLORER_READ_ENDPOINTS, LOG_EXPLORER_READ_RESULTS } from '@ap/feature-shared';

import { currentAuthContext } from '../../lib/auth-context.js';
import type { EndpointHandlerArgs, EndpointResult } from '../menu-dispatch/types.js';
import { budgetSpent, reserveBody, subjectsOf } from './domain/budget.js';
import { type CursorBinding, newCursorKey, signCursor, verifyCursor } from './domain/cursor.js';
import { sampleSetDigest } from './domain/sample-digest.js';
import { filterKeysOf } from './domain/read-params.js';
import type { LogExplorerReadDeps } from './deps.js';
import { toSourceReadError } from './errors.js';
import type { SourceReadContext, SourceReadPort } from './ports/source-read.js';
import { createUsageStore } from './usage-store.js';

export type ReadKind = (typeof LOG_EXPLORER_READ_ENDPOINTS)[number];
type AuditResult = (typeof LOG_EXPLORER_READ_RESULTS)[number];

/** The marker every synthetic answer carries (design §3.1): a fixture is never shown as a connected Source. */
export const SYNTHETIC_MARK = '합성';

/** Why a state was answered. A code, never a Source message. */
export type StateReason = string; // `capability_not_held`, `source_owner_not_granted`, `source_denied`, `source_not_connected`, `source_missing`, or an unsupported reason of the Source schema

type State = 'ok' | 'partial' | 'truncated' | 'unsupported' | 'permission_denied' | 'source_absent';

interface Subject {
  kind: ReadKind;
  sourceOwner: string;
  sampleSet: SourceSampleSet | null;
  query: SourceRecordQuery | null;
}

interface Settled {
  response: EndpointResult;
  result: AuditResult;
  rowCount: number;
  bytes: number;
}

/**
 * The byte length of the body the menu-query route sends for this answer, JSON as sent (escaping, row metadata, cursor, envelope, correlation id):
 * the daily budget charges what goes on the wire, the same measure as an export file. Mirrors `answerOf` in `menu-dispatch/routes.ts`.
 */
const wireBytes = (args: EndpointHandlerArgs, response: EndpointResult): number =>
  Buffer.byteLength(
    JSON.stringify({
      outcome: response.outcome,
      data: response.data ?? null,
      assessments: response.assessments ?? [],
      trust: response.trust ?? null,
      correlationId: args.correlationId,
      ...(response.message !== undefined ? { message: response.message } : {}),
    }),
    'utf8',
  );

function emptyData(kind: ReadKind, state: State, reason: StateReason | null): Record<string, unknown> {
  const base = { state, reason, synthetic: false, label: null };
  switch (kind) {
    case 'records':
      return { ...base, rows: [], nextCursor: null, partial: false, truncated: false };
    case 'periods':
      return { ...base, rows: [], nextCursor: null };
    case 'window':
      return { ...base, rows: [], truncated: false };
    case 'parsed':
      return { ...base, extractedFields: null, parserIn: null, parserOut: null, truncated: false };
  }
}

const stateOnly = (kind: ReadKind, state: Exclude<State, 'ok' | 'partial' | 'truncated'>, reason: StateReason): Settled => ({
  response: { outcome: 'ok', data: emptyData(kind, state, reason) },
  result: state,
  rowCount: 0,
  bytes: 0,
});

/** The uuid-shaped subject id of the audit row: derived from workspace and Source owner, so it carries neither. */
export function subjectIdOf(workspaceId: string, sourceOwner: string): string {
  const h = createHash('sha256').update(`${workspaceId}\u0000${sourceOwner}`, 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** A token's daily body budget would be passed: the read is refused whole (no rows, nothing cut). */
const BUDGET_EXCEEDED_MESSAGE = 'explorer.budget_exceeded';
const budgetRefusal = (): Settled => ({
  response: { outcome: 'error', data: null, message: BUDGET_EXCEEDED_MESSAGE },
  result: 'budget_exceeded',
  rowCount: 0,
  bytes: 0,
});

export function createReadService(deps: LogExplorerReadDeps, port: SourceReadPort | null) {
  const cursorKey = deps.cursorKey ?? newCursorKey();
  const usage = deps.usage ?? createUsageStore(deps.db, deps.clock);

  /** 'ok' or the reason the read is refused. Called before the read and again before the text leaves. */
  async function holdsCapability(args: EndpointHandlerArgs): Promise<boolean> {
    // A token without the read scope holds nothing here (the entry gate lets every authenticated token in so this refusal is audited).
    const auth = currentAuthContext();
    if (auth.kind === 'token' && !auth.scopes.includes('explorer.source.read')) return false;
    const decision = await deps.checkService.checkCapability(args.actor, 'explorer.source.read', { workspace_id: args.actor.workspace_id });
    return decision.allow;
  }
  async function judge(args: EndpointHandlerArgs, sourceOwner: string): Promise<'ok' | 'capability_not_held' | 'source_owner_not_granted'> {
    if (!(await holdsCapability(args))) return 'capability_not_held';
    return (await deps.sourceOwnerAccess.allows(args.actor, sourceOwner)) ? 'ok' : 'source_owner_not_granted';
  }

  async function record(args: EndpointHandlerArgs, subject: Subject, settled: Settled): Promise<void> {
    await deps.db.transaction(async (tx) => {
      await deps.audit.record(tx, {
        workspace_id: args.actor.workspace_id,
        actor_id: args.actor.actor_id,
        event_type: 'explorer.source.read',
        subject_type: 'log_explorer_source',
        subject_id: subjectIdOf(args.actor.workspace_id, subject.sourceOwner),
        summary: `log explorer ${subject.kind} read: ${settled.result}`,
        detail: {
          endpoint: subject.kind,
          sourceOwner: subject.sourceOwner,
          sampleSetDigest: subject.sampleSet ? sampleSetDigest(subject.sampleSet) : null,
          fileCount: subject.sampleSet ? subject.sampleSet.files.length : 1,
          filterKeys: subject.query ? filterKeysOf(subject.query) : [],
          rowCount: settled.rowCount,
          bytes: settled.bytes,
          result: settled.result,
          viaToken: currentAuthContext().kind === 'token',
        },
      });
    });
    // Counted for the admin usage read: a token call under its token and Actor, a session call under its Actor (bytes of a token call were
    // already taken from the budget before the text left).
    const { counted, budgeted } = subjectsOf(args.actor.actor_id, currentAuthContext());
    const day = usage.today();
    for (const subject of counted) {
      await usage.add(args.actor.workspace_id, subject, 'reads', 1, undefined, day);
      if (budgeted.length === 0 && settled.bytes > 0) await usage.add(args.actor.workspace_id, subject, 'bytes', settled.bytes, undefined, day);
    }
  }

  /**
   * One read: judge, ask the port, judge again, audit, answer. `ask` calls the port; `settle` turns an answered `ok` into the
   * wire data. A failure of the Source leaves as a code-only outcome; a failure of our own (database, audit) is thrown so no text leaves.
   */
  async function perform<R extends { status: string }>(
    args: EndpointHandlerArgs,
    subject: Subject,
    pre: () => Settled | null,
    ask: (guarded: SourceReadPort, ctx: SourceReadContext) => Promise<R>,
    settle: (answer: Extract<R, { status: 'ok' }>) => Settled,
  ): Promise<EndpointResult> {
    const finish = async (settled: Settled): Promise<EndpointResult> => {
      await record(args, subject, settled);
      return settled.response;
    };
    // Nothing is connected (production today): a capability holder is told so; the Source-owner rule needs a Source to judge against.
    if (port === null) {
      if (!(await holdsCapability(args))) return finish(stateOnly(subject.kind, 'permission_denied', 'capability_not_held'));
      return finish(stateOnly(subject.kind, 'source_absent', 'source_not_connected'));
    }
    const denied = await judge(args, subject.sourceOwner);
    if (denied !== 'ok') return finish(stateOnly(subject.kind, 'permission_denied', denied));
    const early = pre();
    if (early) return finish(early);
    // A token that has used its day's body budget (or whose Actor has) is refused before the Source is asked.
    const { budgeted } = subjectsOf(args.actor.actor_id, currentAuthContext());
    if (budgeted.length > 0 && (await budgetSpent(usage, args.actor.workspace_id, budgeted))) return finish(budgetRefusal());

    let answer: R;
    try {
      answer = await ask(port, { signal: args.signal ?? new AbortController().signal, timeBudgetMs: SOURCE_READ_TIME_BUDGET_MS });
    } catch (error) {
      const code = toSourceReadError(error).code;
      return finish({
        response: { outcome: code === 'time_budget_exceeded' ? 'timeout' : 'error', data: null, message: code },
        result: code,
        rowCount: 0,
        bytes: 0,
      });
    }
    // Permission revoked while the Source was answering: a state, not rows.
    const still = await judge(args, subject.sourceOwner);
    if (still !== 'ok') return finish(stateOnly(subject.kind, 'permission_denied', still));

    if (answer.status === 'unsupported') {
      return finish(stateOnly(subject.kind, 'unsupported', (answer as unknown as { reason: string }).reason));
    }
    if (answer.status === 'permission_denied') return finish(stateOnly(subject.kind, 'permission_denied', 'source_denied'));
    if (answer.status === 'source_absent') return finish(stateOnly(subject.kind, 'source_absent', 'source_missing'));
    const settled = settle(answer as Extract<R, { status: 'ok' }>);
    // What counts is the serialized body as sent. It counts against the token's and the Actor's budget before it leaves; over budget it is
    // refused whole, never cut.
    settled.bytes = wireBytes(args, settled.response);
    const reservation = budgeted.length > 0 ? await reserveBody(usage, args.actor.workspace_id, budgeted, settled.bytes) : null;
    if (budgeted.length > 0 && reservation === null) return finish(budgetRefusal());
    return finish(settled);
  }

  function pagedBinding(kind: 'records' | 'periods', args: EndpointHandlerArgs, sampleSet: SourceSampleSet, query: SourceRecordQuery, limit: number): CursorBinding {
    return {
      endpoint: kind,
      workspaceId: args.actor.workspace_id,
      actorId: args.actor.actor_id,
      sampleSetDigest: sampleSetDigest(sampleSet),
      query,
      limit,
    };
  }

  /** Signs the adapter's next cursor for exactly this request. */
  const wrap = (binding: CursorBinding, next: string | null) => (next === null ? null : signCursor(cursorKey, binding, next, deps.clock().getTime()));

  async function paged<K extends 'records' | 'periods'>(
    kind: K,
    args: EndpointHandlerArgs,
    input: { sampleSet: SourceSampleSet; query: SourceRecordQuery; cursor: string | null; limit: number },
  ): Promise<EndpointResult> {
    const subject: Subject = { kind, sourceOwner: input.sampleSet.sourceOwner, sampleSet: input.sampleSet, query: input.query };
    const binding = pagedBinding(kind, args, input.sampleSet, input.query, input.limit);
    let adapterCursor: string | null = null;
    const pre = (): Settled | null => {
      if (input.cursor === null) return null;
      adapterCursor = verifyCursor(cursorKey, binding, input.cursor, deps.clock().getTime());
      if (adapterCursor !== null) return null;
      return { response: { outcome: 'error', data: null, message: 'cursor_invalid' }, result: 'cursor_invalid', rowCount: 0, bytes: 0 };
    };
    if (kind === 'records') {
      return perform<SourceSearchResponse>(
        args,
        subject,
        pre,
        (guarded, ctx) => guarded.searchRecords({ sampleSet: input.sampleSet, query: input.query, cursor: adapterCursor, limit: input.limit }, ctx),
        (answer) => {
          const truncated = answer.rows.some((row) => row.truncated);
          const synthetic = answer.rows.some((row) => row.synthetic);
          const state: State = answer.partial ? 'partial' : truncated ? 'truncated' : 'ok';
          return {
            response: {
              outcome: 'ok',
              data: {
                state,
                reason: null,
                rows: answer.rows,
                nextCursor: wrap(binding, answer.nextCursor),
                partial: answer.partial,
                truncated,
                synthetic,
                label: synthetic ? SYNTHETIC_MARK : null,
              },
            },
            result: state,
            rowCount: answer.rows.length,
            bytes: 0,
          };
        },
      );
    }
    return perform<SourcePeriodsResponse>(
      args,
      subject,
      pre,
      (guarded, ctx) => guarded.getPeriods({ sampleSet: input.sampleSet, query: input.query, cursor: adapterCursor, limit: input.limit }, ctx),
      (answer) => {
        const synthetic = answer.rows.some((row) => row.synthetic);
        return {
          response: {
            outcome: 'ok',
            data: { state: 'ok', reason: null, rows: answer.rows, nextCursor: wrap(binding, answer.nextCursor), synthetic, label: synthetic ? SYNTHETIC_MARK : null },
          },
          result: 'ok',
          rowCount: answer.rows.length,
          bytes: 0,
        };
      },
    );
  }

  return {
    records: (args: EndpointHandlerArgs, input: { sampleSet: SourceSampleSet; query: SourceRecordQuery; cursor: string | null; limit: number }) => paged('records', args, input),
    periods: (args: EndpointHandlerArgs, input: { sampleSet: SourceSampleSet; query: SourceRecordQuery; cursor: string | null; limit: number }) => paged('periods', args, input),

    window(args: EndpointHandlerArgs, input: { sourceOwner: string; fileRef: string; line: number; before: number; after: number }): Promise<EndpointResult> {
      const subject: Subject = { kind: 'window', sourceOwner: input.sourceOwner, sampleSet: null, query: null };
      return perform<SourceWindowResponse>(
        args,
        subject,
        () => null,
        (guarded, ctx) => guarded.getWindow(input, ctx),
        (answer) => {
          const truncated = answer.truncated || answer.rows.some((row) => row.truncated);
          const synthetic = answer.rows.some((row) => row.synthetic);
          const state: State = truncated ? 'truncated' : 'ok';
          return {
            response: { outcome: 'ok', data: { state, reason: null, rows: answer.rows, truncated, synthetic, label: synthetic ? SYNTHETIC_MARK : null } },
            result: state,
            rowCount: answer.rows.length,
            bytes: 0,
          };
        },
      );
    },

    parsed(args: EndpointHandlerArgs, input: { sourceOwner: string; fileRef: string; line: number }): Promise<EndpointResult> {
      const subject: Subject = { kind: 'parsed', sourceOwner: input.sourceOwner, sampleSet: null, query: null };
      return perform<SourceParsedResponse>(
        args,
        subject,
        () => null,
        (guarded, ctx) => guarded.getParsed(input, ctx),
        (answer) => {
          const state: State = answer.truncated ? 'truncated' : 'ok';
          return {
            response: {
              outcome: 'ok',
              data: {
                state,
                reason: null,
                extractedFields: answer.extractedFields,
                parserIn: answer.parserIn,
                parserOut: answer.parserOut,
                truncated: answer.truncated,
                synthetic: answer.synthetic,
                label: answer.synthetic ? SYNTHETIC_MARK : null,
              },
            },
            result: state,
            rowCount: 1,
            bytes: 0,
          };
        },
      );
    },
  };
}

export type ReadService = ReturnType<typeof createReadService>;
