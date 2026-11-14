import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { installAuthStore, installTokenGate } from '../gate.js';
import type { ApiTokenService } from '../service.js';

describe('unidentified token failures (#2016 SER-6)', () => {
  it.each(['malformed', 'unknown', 'revoked', 'expired', 'owner_mismatch', 'workspace'])(
    'keeps the 401 for %s and audits only stored-token failures', async (reason) => {
      const lines: string[] = [];
      const app = Fastify({ logger: { stream: { write: (line: string) => { lines.push(line); } } } });
      const unidentified = reason === 'malformed' || reason === 'unknown';
      const result = { ok: false, reason, prefix: 'abcdef12', tokenId: unidentified ? null : 'token-1', actorId: null, workspaceId: null };
      const recordAuthFailure = vi.fn();
      const tokens = { authenticate: vi.fn(async () => result), recordAuthFailure } as unknown as ApiTokenService;
      installAuthStore(app);
      installTokenGate(app, { tokens });
      app.get('/probe', async () => ({ ok: true }));
      try {
        const response = await app.inject({ method: 'GET', url: '/probe', headers: { authorization: 'Bearer synthetic-private-value' } });
        expect(response.statusCode).toBe(401);
        expect(response.json().code).toBe('auth.token_invalid');
        if (unidentified) {
          expect(recordAuthFailure).not.toHaveBeenCalled();
          const warning = lines.map((line) => JSON.parse(line) as Record<string, unknown>).find((line) => line.level === 40);
          expect(warning).toMatchObject({ prefix: 'abcdef12', reason });
          expect(JSON.stringify(warning)).not.toContain('synthetic-private-value');
        } else {
          expect(recordAuthFailure).toHaveBeenCalledWith(result);
        }
      } finally {
        await app.close();
      }
    },
  );
});
