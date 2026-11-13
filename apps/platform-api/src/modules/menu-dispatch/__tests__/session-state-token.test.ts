// #1874: the shared session state (dispatch identity `sv`, bootstrap, polling) reads no site·room grants for an API
// token without `scope.read` (ADR-0116). DB-free; the resolver is a synthetic stub.

import { describe, expect, it, vi } from 'vitest';

import { runAsToken } from '../../../lib/auth-context.js';
import { stubDb } from '../../../test-support/platform-route-stubs.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createPlatformPermissionResolver } from '../../platform-port/permissions.js';
import { createSessionState } from '../../platform-port/session-snapshot.js';
import type { LoadedSession } from '../../platform-port/transport.js';

const catalog = { sites: [{ site: 'SITE-X', label: 'Site X', rooms: ['ROOM-1', 'ROOM-2'] }] };
const loaded = { actor: { id: 'synthetic-actor', displayName: 'Synthetic', roleLevel: 'admin' }, session: { workspaceId: 'synthetic-ws' } } as unknown as LoadedSession;

async function state(run: (fn: () => Promise<unknown>) => Promise<unknown>) {
  const resolve = vi.fn(async () => [{ site: 'SITE-X', rooms: ['ROOM-1'] }]);
  const build = createSessionState({
    permissions: createPlatformPermissionResolver([]),
    checkService: createCheckService({ db: stubDb().db }),
    scopeCatalog: catalog as never,
    scopeResolver: { resolve },
  });
  const result = (await run(() => build(loaded))) as Awaited<ReturnType<typeof build>>;
  return { resolve, result };
}

describe('session state judges token scope.read before reading grants (#1874)', () => {
  it('token without scope.read: no resolver call, no grants in the session or the version input', async () => {
    const denied = await state((fn) => runAsToken('synthetic-token', ['workspace.read'], fn));
    expect(denied.resolve).not.toHaveBeenCalled();
    expect(denied.result.session.scopes).toEqual([]);
    const session = await state((fn) => fn());
    expect(denied.result.version).not.toBe(session.result.version);
  });

  it.each([
    ['token with scope.read', (fn: () => Promise<unknown>) => runAsToken('synthetic-token', ['scope.read'], fn)],
    ['session caller', (fn: () => Promise<unknown>) => fn()],
  ])('%s: grants are read as before', async (_name, run) => {
    const { resolve, result } = await state(run);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(result.session.scopes).toEqual([{ id: 'SITE-X', label: 'Site X', grantedRooms: 1, totalRooms: 2 }]);
  });
});
