import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { viewerOf } from '../log-knowledge/index.js';
import { VALIDATION_ISSUE_LIMITS as L } from '@ap/feature-shared';
import { CLOSED_ISSUE_STATES, ISSUE_STATES, OPEN_ISSUE_STATES } from './domain/validation-issue-states.js';
import { discussionVisible, readDiscussion, readIssueDetail, readIssueHistory, readIssueList, readIssueOccurrences, readIssueStateCounts, readIssueTransitions, type DiscussionTarget, type IssueFilters, type IssuePageKey } from './repositories/validation-issue-read.js';

type Caller = { workspace_id: string; actor_id: string };
const id = z.string().uuid();
const pageSchema = z.object({ cursor: z.string().min(1).max(4096).optional(), limit: z.number().int().min(1).max(L.pageMax).default(L.pageDefault) }).strict();
interface Cursor { snapshot: string; after: IssuePageKey; expires: number }
/** Instance-scoped authenticated cursors; exact PG timestamps retain microseconds. */
export function createValidationIssueReader(deps: { db: Db }) {
  const key = randomBytes(32);
  function encode(binding: Buffer, value: Cursor): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(binding);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url');
  }
  function decode(binding: Buffer, cursor: string): Cursor {
    try {
      const bytes = Buffer.from(cursor, 'base64url');
      if (bytes.toString('base64url') !== cursor || bytes.length < 29) throw new Error('cursor');
      const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAAD(binding);
      cipher.setAuthTag(bytes.subarray(12, 28));
      const v = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString()) as Cursor;
      if (!v.after || !id.safeParse(v.after.id).success || !Number.isFinite(Date.parse(v.after.at)) || !Number.isFinite(Date.parse(v.snapshot)) || !Number.isFinite(v.expires) || v.expires < Date.now()) throw new Error('cursor');
      return v;
    } catch { throw new HttpError('validation.failed', 'cursor_invalid'); }
  }
  async function page<T extends { id: string }>(caller: Caller, scope: unknown, options: unknown, read: (snapshot: string, after: IssuePageKey | null, limit: number) => Promise<T[]>, at: (row: T) => string, onSnapshot?: (snapshot: string) => Promise<void>) {
    const q = pageSchema.parse(options);
    const binding = Buffer.from(JSON.stringify([caller.workspace_id, caller.actor_id, scope, q.limit]));
    const prior = q.cursor ? decode(binding, q.cursor) : null;
    const now = prior ? null : await deps.db.execute(sql`select clock_timestamp()::text as snapshot`);
    const snapshot = prior?.snapshot ?? String(now?.rows[0]?.snapshot);
    const expires = prior?.expires ?? Date.now() + 30 * 60 * 1000;
    const rows = await read(snapshot, prior?.after ?? null, q.limit + 1);
    await onSnapshot?.(snapshot);
    const visible = rows.slice(0, q.limit);
    const last = visible.at(-1);
    return { rows: visible, ...(last && rows.length > q.limit ? { nextCursor: encode(binding, { snapshot, after: { at: at(last), id: last.id }, expires }) } : {}) };
  }
  async function list(caller: Caller, filters: IssueFilters = {}, options: unknown = {}) {
    const f = z.object({ projectId: id.optional(), roundId: id.optional(), states: z.array(z.enum(ISSUE_STATES)).min(1).optional() }).strict().parse(filters);
    // The state filter is part of the cursor binding. Counts (project- or Round-level, by state) ignore it: the Gate warning
    // of N3 reads open counts here; nothing blocks the Gate.
    let counts: { open: number; closed: number; byState: Record<string, number> } = { open: 0, closed: 0, byState: {} };
    const listed = await page(caller, ['issues', f.projectId ?? null, f.roundId ?? null, f.states ? [...f.states].sort() : null], options,
      (snapshot, after, limit) => readIssueList(deps.db, viewerOf(caller), f, snapshot, after, limit), row => row.lastActivityAt,
      async snapshot => {
        const byState = Object.fromEntries(ISSUE_STATES.map(s => [s, 0])) as Record<string, number>;
        for (const r of await readIssueStateCounts(deps.db, viewerOf(caller), { projectId: f.projectId, roundId: f.roundId }, snapshot)) byState[r.state] = r.count;
        const sum = (states: readonly string[]) => states.reduce((n, s) => n + (byState[s] ?? 0), 0);
        counts = { open: sum(OPEN_ISSUE_STATES), closed: sum(CLOSED_ISSUE_STATES), byState };
      });
    return { ...listed, counts };
  }
  async function comments(caller: Caller, target: DiscussionTarget, options: unknown = {}) {
    const t = z.object({ kind: z.enum(['issue', 'round']), id }).strict().parse(target);
    if (!await discussionVisible(deps.db, viewerOf(caller), t)) return null;
    return page(caller, ['comments', t.kind, t.id], options,
      (snapshot, after, limit) => readDiscussion(deps.db, viewerOf(caller), t, snapshot, after, limit), row => row.createdAt);
  }
  async function history(caller: Caller, issueId: string, options: unknown = {}, of: 'corrections' | 'transitions' = 'corrections') {
    id.parse(issueId);
    if (!await discussionVisible(deps.db, viewerOf(caller), { kind: 'issue', id: issueId })) return null;
    if (of === 'transitions') {
      return page(caller, ['history', issueId, 'transitions'], options,
        (snapshot, after, limit) => readIssueTransitions(deps.db, viewerOf(caller), issueId, snapshot, after, limit), row => row.createdAt);
    }
    return page(caller, ['history', issueId], options,
      (snapshot, after, limit) => readIssueHistory(deps.db, viewerOf(caller), issueId, snapshot, after, limit), row => row.createdAt);
  }
  async function occurrences(caller: Caller, issueId: string, options: unknown = {}) {
    id.parse(issueId);
    if (!await discussionVisible(deps.db, viewerOf(caller), { kind: 'issue', id: issueId })) return null;
    return page(caller, ['occurrences', issueId], options,
      (snapshot, after, limit) => readIssueOccurrences(deps.db, viewerOf(caller), issueId, snapshot, after, limit), row => row.createdAt);
  }
  return { list, comments, history, occurrences, detail: (caller: Caller, issueId: string) => readIssueDetail(deps.db, viewerOf(caller), id.parse(issueId)) };
}
