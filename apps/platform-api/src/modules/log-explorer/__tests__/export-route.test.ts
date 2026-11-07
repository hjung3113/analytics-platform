// The export route's HTTP mapping of a refusal before the first byte (#1472 C9), DB-free: the real route plugin on a bare Fastify with a fake session.
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { createAuditService } from '../../core/audit/audit-service.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { createSyntheticSourceReadPort, sampleSetOf, syntheticFixture } from '../adapters/synthetic/index.js';
import type { LogExplorerExportDeps } from '../deps.js';
import { logExplorerExportRoutes } from '../export-routes.js';
import { guardSourceReadPort } from '../ports/guarded.js';
import { createMemoryUsageStore } from '../testing/memory-usage-store.js';

const WS = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '00000000-0000-4000-8000-0000000000a1';

async function server() {
  const fixture = syntheticFixture('typical');
  const state = { allowed: true };
  const audits: Array<{ detail: Record<string, unknown> }> = [];
  const tx = { insert: () => ({ values: async (v: (typeof audits)[number]) => void audits.push(v) }) };
  const deps: LogExplorerExportDeps = {
    db: { transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx) } as never,
    checkService: { checkCapability: async () => (state.allowed ? { allow: true, via: 'direct_grant' } : { allow: false, reason: 'no_grant', requestable: null }) } as never,
    audit: createAuditService(),
    clock: () => new Date(Date.UTC(2026, 10, 8, 12)),
    sourceReadPort: null,
    sourceOwnerAccess: { allows: async () => true },
    usage: createMemoryUsageStore(() => new Date(Date.UTC(2026, 10, 8, 12))),
    tokenActive: async () => true,
    exportChunkBytes: 64 * 1024,
  };
  const sessionService = {
    loadAndTouch: async () => ({ session: { id: 's', actorId: ACTOR_ID, workspaceId: WS, roleLevel: 'user' }, actor: { id: ACTOR_ID, roleLevel: 'user' } }),
  };
  const app = Fastify();
  await app.register(cookie);
  await app.register(logExplorerExportRoutes, {
    prefix: '/api/v1/log-explorer',
    deps,
    port: guardSourceReadPort(createSyntheticSourceReadPort(fixture)),
    sessionService: sessionService as never,
    workspaceId: WS,
  });
  await app.ready();
  const request = () =>
    app.inject({
      method: 'POST',
      url: '/api/v1/log-explorer/export',
      cookies: { [SESSION_COOKIE_NAME]: 'x' },
      payload: { sampleSet: sampleSetOf(fixture), query: {}, range: { rows: 5 }, format: 'csv' },
    });
  return { app, state, audits, request };
}

describe('export route: a refusal before the first byte (C9)', () => {
  it('a right revoked during the start audit is 403 explorer.forbidden with zero Source bytes, not 422 malformed_request', async () => {
    const w = await server();
    try {
      const original = w.state;
      // Revoke once the start audit row is written (before the first consumption of the stream).
      const push = w.audits.push.bind(w.audits);
      w.audits.push = (...items) => {
        original.allowed = false;
        return push(...items);
      };
      const res = await w.request();
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'explorer.forbidden' });
      expect(res.body).not.toContain('synthetic');
      expect(w.audits.map((a) => a.detail.result)).toEqual(['ok', 'revoked']);
    } finally {
      await w.app.close();
    }
  });

  it('control: with the right intact the same request streams the file', async () => {
    const w = await server();
    try {
      const res = await w.request();
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('fileRef');
    } finally {
      await w.app.close();
    }
  });
});
