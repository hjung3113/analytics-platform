// `POST /api/v1/log-explorer/export` (#1472, design log-explorer §5): session or Bearer token, one request = one export (export-service.ts).
// Success is a download stream (`text/csv` / `application/x-ndjson`, `Content-Length` set so a client can tell a stopped stream from a whole file,
// `no-store`); a refusal is a JSON `{ code, message }` with the code and status of the `@ap/contract-schemas` export contract. The route sets
// `tokenCallable` (without it the token gate refuses every Bearer call); the right itself (`explorer.export` ∩ the token's scopes) is judged in the
// service on every request. No CSRF step, like the menu-query read: the response goes to the caller, and the body is only read, never written.

import { EXPORT_ERROR_STATUS } from '@ap/contract-schemas';
import type { FastifyPluginAsync } from 'fastify';

import { currentAuthContext } from '../../lib/auth-context.js';
import { sendError } from '../../lib/errors.js';
import { refuseLostTokenContext } from '../api-tokens/gate.js';
import type { SessionService } from '../auth/session-service.js';
import { createAuthenticator, installPlatformTransport, platformActorOf } from '../platform-port/transport.js';
import type { LogExplorerExportDeps } from './deps.js';
import { createExportService, StreamStopped } from './export-service.js';
import type { SourceReadPort } from './ports/source-read.js';

export const LOG_EXPLORER_ROUTE_PREFIX = '/api/v1/log-explorer';

export interface LogExplorerExportRoutesOptions {
  deps: LogExplorerExportDeps;
  /** The guarded Source port, or null while none is connected. */
  port: SourceReadPort | null;
  sessionService: SessionService;
  workspaceId: string;
}

const REFUSAL_MESSAGE: Record<keyof typeof EXPORT_ERROR_STATUS, string> = {
  'explorer.budget_exceeded': 'the daily response budget is used up',
  'explorer.range_too_large': 'the export is over the row or size limit',
  'explorer.forbidden': 'this export is not allowed',
  'explorer.source_unavailable': 'the Source cannot answer this export',
  'explorer.export_busy': 'another export is running',
  'explorer.export_daily_limit': 'the daily export count is used up',
  'explorer.investigation_unsupported': 'an investigation id is not supported yet; send a sample set',
};

export const logExplorerExportRoutes: FastifyPluginAsync<LogExplorerExportRoutesOptions> = async (app, opts) => {
  installPlatformTransport(app, { notFound: true });
  const authenticate = createAuthenticator({ sessionService: opts.sessionService, workspaceId: opts.workspaceId });
  const service = createExportService(opts.deps, opts.port);

  // A right gone before the first byte surfaces as the stream's first error with no headers sent: answered as the export contract's 403, not as a
  // malformed request. Once headers are out Fastify only destroys the connection (this handler is never reached), so the client sees a cut file.
  const errorHandler: NonNullable<Parameters<typeof app.post>[1]['errorHandler']> = (err, req, reply) => {
    if (err instanceof StreamStopped) {
      // The download headers were already set for a file that will not come.
      reply.removeHeader('content-length').removeHeader('content-disposition').header('content-type', 'application/json; charset=utf-8');
      return reply.code(EXPORT_ERROR_STATUS['explorer.forbidden']).send({ code: 'explorer.forbidden', message: REFUSAL_MESSAGE['explorer.forbidden'] });
    }
    return app.errorHandler(err, req, reply);
  };

  // authInHandler (#1972): the disconnect listener is attached before the session lookup (see below).
  app.post('/export', { config: { tokenCallable: true, authInHandler: true }, errorHandler }, async (req, reply) => {
    // The client going away cancels the Source reads and the stream. Tracked BEFORE the authentication await (same order as the menu-query
    // route), so a disconnect while the session loads is not missed; an already destroyed connection starts aborted.
    const abandoned = new AbortController();
    const abandon = () => {
      if (!reply.raw.writableFinished) abandoned.abort();
    };
    reply.raw.once('close', abandon);
    if (reply.raw.destroyed) abandon();
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    if (refuseLostTokenContext(req, reply)) return reply;
    const outcome = await service.run({ actor: platformActorOf(loaded), auth: currentAuthContext(), body: req.body, signal: abandoned.signal });
    switch (outcome.kind) {
      case 'invalid':
        return sendError(reply, 'validation.failed', 'invalid export request', { fields: outcome.fields });
      case 'refused':
        return reply.code(EXPORT_ERROR_STATUS[outcome.code]).send({ code: outcome.code, message: REFUSAL_MESSAGE[outcome.code] });
      case 'aborted':
        return reply;
      case 'stream':
        return reply
          .header('content-type', `${outcome.contentType}; charset=utf-8`)
          .header('content-disposition', `attachment; filename="${outcome.filename}"`)
          .header('content-length', String(outcome.byteLength))
          .header('x-content-type-options', 'nosniff')
          .send(outcome.stream);
    }
  });
};
