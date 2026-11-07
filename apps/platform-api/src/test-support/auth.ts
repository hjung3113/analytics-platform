import type { FastifyInstance } from 'fastify';

import { SESSION_COOKIE_NAME } from '../middleware/require-session.js';

export function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * A stable client address per external id (10.x.y.z). The global rate limiter keys unauthenticated requests by client IP (50/min), and
 * every test file of a run shares one DB-backed bucket: logging in from one address made the run's total number of mock-logins decide
 * whether an unrelated file's first requests get a 429. Each test identity logs in from its own address instead.
 */
export function testClientAddress(externalId: string): string {
  let h = 2166136261;
  for (const ch of externalId) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619) >>> 0;
  return `10.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${(h & 255) || 1}`;
}

export async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    remoteAddress: testClientAddress(externalId),
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error(`mock-login failed: ${res.statusCode} ${res.body}`);
  return cookie;
}

export { SESSION_COOKIE_NAME };
