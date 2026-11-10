// Root-level CSRF defence for cookie-authenticated state-changing requests (#1674, ADR-0071 decision 4).
//
// Several session-cookie POST routes read no body and need no custom header (archive, dismiss, confirm, revoke, mark-read,
// logout), so only `SameSite=Lax` stood between them and a same-site page's form post (`text/plain` and
// `multipart/form-data` both reach the handler). A browser states where a request comes from in `Sec-Fetch-Site`, a
// forbidden header page script cannot set or forge. This hook rejects a state-changing request that carries the session
// cookie and whose `Sec-Fetch-Site` is present and not `same-origin`, before the body is parsed and before any handler.
//
// Not touched: safe methods; requests without the session cookie; a Bearer API-token call (no ambient credential, the
// token gate owns it); a request without the header (CLI, server-side client, test client, a browser too old to send it).
// `same-site` is refused too: a sibling subdomain page is exactly the attacker this defends against, and the app's own
// fetch calls are `same-origin` through the vite dev proxy and the nginx edge. Zero DB reads, one header lookup.

import type { FastifyInstance } from 'fastify';

import { sendError } from '../lib/errors.js';
import { bearerValue } from '../modules/api-tokens/index.js';
import { SESSION_COOKIE_NAME } from './require-session.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function installCrossSiteGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    if (!STATE_CHANGING_METHODS.has(req.method)) return undefined;
    if (bearerValue(req.headers.authorization) !== null) return undefined;
    if (!req.cookies?.[SESSION_COOKIE_NAME]) return undefined;
    const site = req.headers['sec-fetch-site'];
    if (site === undefined || site === 'same-origin') return undefined;
    return sendError(
      reply,
      'permission.cross_site_request',
      'state-changing requests with a session cookie must come from the same origin',
    );
  });
}
