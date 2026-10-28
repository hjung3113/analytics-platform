// Platform port `reportClientError` (ADR-0069 decisions 1, 2; #622). Identity fields only — no
// message, stack or URL is ever stored (http-adapter-contract §1). Validation mirrors the reference
// server (`packages/adapters/mock-server/src/server.ts` reportClientError); the server stamps actor, request id
// and receive time. Insert-only: there is no read API and no purge job (backlog: retention).

import type { Db } from '../../db/client.js';
import { clientErrors } from '../../db/schema/platform.js';
import type { PlatformActor } from './permissions.js';
import { isPlainObject, validIdentifier, validSpaceId } from './usage.js';

const REPORT_KEYS = ['correlationId', 'menuId', 'spaceId', 'path', 'name'] as const;
const ERROR_NAME = /^[A-Za-z_$][\w$]{0,79}$/;

export interface ParsedClientError {
  correlationId: string;
  menuId: string;
  spaceId: string | null;
  path: string;
  name: string;
}

export function parseClientError(body: unknown): ParsedClientError | null {
  if (!isPlainObject(body)) return null;
  const keys = Object.keys(body);
  if (
    keys.length !== REPORT_KEYS.length ||
    keys.some((k) => !(REPORT_KEYS as readonly string[]).includes(k))
  ) {
    return null;
  }
  const { correlationId, menuId, spaceId, path, name } = body;
  if (
    typeof correlationId !== 'string' ||
    correlationId.length > 80 ||
    !correlationId.startsWith('client-')
  ) {
    return null;
  }
  if (!validIdentifier(menuId, 80) || !validIdentifier(path, 200) || !/^\/(?!\/)/.test(path)) {
    return null;
  }
  if (!validSpaceId(spaceId)) return null;
  if (typeof name !== 'string' || !ERROR_NAME.test(name)) return null;
  return { correlationId, menuId, spaceId, path, name };
}

export function createPlatformClientErrorService(deps: { db: Db }) {
  async function reportClientError(
    actor: PlatformActor,
    requestId: string,
    report: ParsedClientError,
  ): Promise<void> {
    await deps.db.insert(clientErrors).values({
      workspaceId: actor.workspace_id,
      actorId: actor.actor_id,
      requestId,
      ...report,
    });
  }
  return { reportClientError };
}
