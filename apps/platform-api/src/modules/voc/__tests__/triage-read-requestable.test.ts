import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import { HttpError } from '../../../lib/errors.js';
import * as managedSystems from '../../managed-systems/read-projections.js';
import type { CheckService } from '../../permissions/check-service.js';
import * as authorization from '../authorization.js';
import type { Scope } from '../authorization.js';
import type { ReadActorContext, VocReadServiceDeps } from '../read-service.js';
import { createVocListReaders } from '../read/list.js';
import { resolveVocListScope } from '../read/scope.js';

const actor: ReadActorContext = {
  actor_id: '01919b8c-0000-7000-8000-000000000001',
  workspace_id: '01919b8c-0000-7000-8000-000000000002',
  role_level: 'developer',
};
const A = '01919b8c-0000-7000-8000-00000000000a';
const B = '01919b8c-0000-7000-8000-00000000000b';
const unusedDb = {
  select() {
    throw new Error('unexpected request lookup');
  },
} as unknown as Db;
const checkService = {
  async checkCapability(): Promise<never> {
    throw new Error('unexpected point check');
  },
};

function scoped(ids: string[]): Scope {
  return { kind: 'scoped', managedSystemIds: ids };
}

async function requestable(read: Scope, triage: Scope, managedSystemId?: string) {
  try {
    await resolveVocListScope({
      actor,
      db: unusedDb,
      checkService,
      query: {
        view: 'triage',
        ...(managedSystemId !== undefined ? { managed_system_id: managedSystemId } : {}),
      },
      readScope: read,
      triageScope: triage,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return {
      code: error.code,
      permission: (
        error.detail as {
          requestable_permission?: { permission: string; managed_system_id: string | null };
        }
      ).requestable_permission,
    };
  }
  throw new Error('expected triage scope to reject');
}

describe('triage list requestable when read and triage do not both cover the queue', () => {
  it.each([
    {
      name: 'workspace-wide triage and no read, no System',
      read: scoped([]),
      triage: { kind: 'all' },
      selected: undefined,
      code: 'permission.denied',
      permission: 'voc.read',
      system: null,
    },
  ] as const)(
    '$name requests $permission',
    async ({ read, triage, selected, code, permission, system }) => {
      expect(await requestable(read, triage, selected)).toEqual({
        code,
        permission: { permission, managed_system_id: system },
      });
    },
  );

  it('still returns a selection that is inside read ∩ triage', async () => {
    expect(
      await resolveVocListScope({
        actor,
        db: unusedDb,
        checkService,
        query: { view: 'triage', managed_system_id: A },
        readScope: scoped([A, B]),
        triageScope: scoped([A]),
      }),
    ).toEqual({ scopeFilter: { kind: 'scoped', managedSystemIds: [A] } });
  });
});

describe('optional VOC list denial hints', () => {
  const query = { view: 'inbox', managed_system_id: A } as const;
  const denial = {
    code: 'permission.scope_required',
    message: 'managed_system_id not in voc.read scope',
    detail: { requiredScope: [A] },
  };

  it.each(['countVocs', 'countGroupedVocs'] as const)('%s skips the permission hint lookup', async (method) => {
    const pointCheck = vi.fn<CheckService['checkCapability']>().mockResolvedValue({
      allow: false, reason: 'no_grant', requestable: [{ workspace_id: actor.workspace_id }],
    });
    const readers = createVocListReaders({
      checkService: { checkCapability: pointCheck },
    } as unknown as VocReadServiceDeps);
    const readScope = scoped([B]);
    const readScopeLookup = vi.spyOn(authorization, 'actorReadScope').mockResolvedValue(readScope);
    try {
      const result = method === 'countVocs'
        ? readers.countVocs({ actor, query })
        : readers.countGroupedVocs({ actor, readScope, managedSystemId: A });
      await expect(result).rejects.toMatchObject(denial);
      expect(pointCheck).not.toHaveBeenCalled();
      await expect(result).rejects.not.toHaveProperty('detail.requestable_permission');
    } finally {
      readScopeLookup.mockRestore();
    }
  });

  const failingCheck = (error: Error) => ({
    async checkCapability(): Promise<never> {
      throw error;
    },
  });
  const deniedWith = (check: Pick<CheckService, 'checkCapability'>) =>
    resolveVocListScope({
      actor,
      db: unusedDb,
      checkService: check as typeof checkService,
      query,
      readScope: scoped([B]),
      triageScope: undefined,
    });

  it('preserves the scope denial if the database cannot answer the hint lookup', async () => {
    const result = deniedWith(failingCheck(new pg.DatabaseError('relation does not exist', 0, 'error')));
    await expect(result).rejects.toBeInstanceOf(HttpError);
    await expect(result).rejects.toMatchObject(denial);
    await expect(result).rejects.not.toHaveProperty('detail.requestable_permission');
  });

  it('propagates a bug in the hint lookup instead of hiding it behind the 403', async () => {
    const bug = new TypeError('cannot read properties of undefined');
    await expect(deniedWith(failingCheck(bug))).rejects.toBe(bug);
  });
});

it('omits the sole triage fallback hint for an unregistered UUID', async () => {
  // The DB's grant FK prevents storing a grant for an unregistered System.
  const checkCapability = vi.fn<CheckService['checkCapability']>().mockResolvedValue({
    allow: false, reason: 'no_grant', requestable: [{ workspace_id: actor.workspace_id }],
  });
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  } as unknown as Db;
  const candidates = vi.spyOn(managedSystems, 'allManagedSystemIds').mockResolvedValue([B]);
  try {
    const result = resolveVocListScope({
      actor,
      db,
      checkService: { checkCapability },
      query: { view: 'triage' },
      readScope: scoped([]),
      triageScope: scoped([A]),
    });
    await expect(result).rejects.toMatchObject({ code: 'permission.denied' });
    await expect(result).rejects.not.toHaveProperty('detail.requestable_permission');
  } finally {
    candidates.mockRestore();
  }
});
