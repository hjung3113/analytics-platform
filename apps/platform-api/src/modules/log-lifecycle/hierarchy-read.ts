import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { PlatformActor } from '../platform-port/permissions.js';
import type { EndpointResult } from '../menu-dispatch/types.js';
import type { LogLifecycleDeps } from './deps.js';
import type { HierarchyQuery } from './domain/hierarchy-params.js';
import { viewerOf } from '../log-knowledge/index.js';
import { hierarchyNodes } from './repositories/hierarchy-read.js';
import { escapeLikePattern } from '../../lib/sql-like.js';

/** Opaque authenticated keyset cursor, scoped to this server instance, session actor, workspace and operation. */
export function hierarchyReader(deps: LogLifecycleDeps) {
  const key = randomBytes(32);
  return async (actor: PlatformActor, q: HierarchyQuery): Promise<EndpointResult> => {
    const deleted = (): EndpointResult => ({ outcome: 'ok', data: { failure: 'deleted' } });
    if (q.op === 'ancestors') {
      const parts = q.nodeId.split('/');
      const ids = Array.from({ length: parts.length / 2 }, (_, i) => parts.slice(0, (i + 1) * 2).join('/'));
      const nodes = await hierarchyNodes(deps.db, viewerOf(actor), sql`n.id in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`, ids.length);
      if (!nodes.some(n => n.id === q.nodeId) || nodes.length !== ids.length) return deleted();
      return { outcome: 'ok', data: nodes.filter(n => n.id !== q.nodeId) };
    }
    const binding = Buffer.from(JSON.stringify([actor.workspace_id, actor.actor_id, q.op, q.op === 'children' ? q.parentId : q.query, q.limit]));
    let after = '';
    if (q.cursor !== undefined) {
      try {
        const bytes = Buffer.from(q.cursor, 'base64url');
        if (bytes.toString('base64url') !== q.cursor || bytes.length < 29) throw new Error('cursor');
        const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        cipher.setAAD(binding); cipher.setAuthTag(bytes.subarray(12, 28));
        const decoded = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8')) as { after?: unknown; expires?: unknown };
        if (typeof decoded.after !== 'string' || typeof decoded.expires !== 'number' || decoded.expires < Date.now()) throw new Error('cursor');
        after = decoded.after;
      } catch {
        return { outcome: 'error', data: null, message: 'cursor_invalid' };
      }
    }
    if (q.op === 'children' && q.parentId !== null) {
      const parents = await hierarchyNodes(deps.db, viewerOf(actor), sql`n.id = ${q.parentId}`, 1);
      if (!parents.length) return deleted();
    }
    const filter = q.op === 'children'
      ? q.parentId === null ? sql`n.parent_id is null` : sql`n.parent_id = ${q.parentId}`
      : sql`n.label ilike ${`%${escapeLikePattern(q.query)}%`}`;
    const rows = await hierarchyNodes(deps.db, viewerOf(actor), sql`(${filter}) and n.id collate "C" > ${after}`, q.limit + 1);
    const nodes = rows.slice(0, q.limit);
    let nextCursor: string | undefined;
    if (rows.length > q.limit) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(binding);
      const body = Buffer.concat([cipher.update(JSON.stringify({ after: nodes.at(-1)?.id, expires: Date.now() + 30 * 60 * 1000 })), cipher.final()]);
      nextCursor = Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url');
    }
    return { outcome: 'ok', data: { nodes, ...(nextCursor ? { nextCursor } : {}) } };
  };
}
