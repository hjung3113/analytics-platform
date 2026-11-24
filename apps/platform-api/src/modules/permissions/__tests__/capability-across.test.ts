import { describe, expect, it } from 'vitest';
import type { CapabilityName } from '@ap/feature-shared';
import type { Db } from '../../../db/client.js';
import { permissionDenies } from '../../../db/schema/permission.js';
import { createCapabilityRegistry, createCheckService, checkCapabilityAcross, memoizeCapabilityChecks, type DenyAndGrantRows, type Decision } from '../check-service.js';

const workspace_id = 'workspace';
const systems = ['north', 'south'];
const now = new Date('2026-10-13T00:00:00.000Z');
const current = { id: 'grant', managedSystemId: 'north', revokedAt: null, expiresAt: null };
const capabilities = createCapabilityRegistry([{ id: 'ext.test.view', roleLevels: ['admin'] }]);

type Case = Partial<DenyAndGrantRows> & {
  label: string;
  role?: string;
  capability?: CapabilityName;
  expected: string[];
};

describe('point decisions across Managed Systems', () => {
  it('shares first decisions and one permission pair between batches and points in both orders', async () => {
    const actor = { actor_id: 'actor', workspace_id, role_level: 'developer' };
    const denyRows: DenyAndGrantRows['denyRows'] = [];
    const reads: unknown[] = [];
    const handle = (statements: unknown[]) => ({
      select: () => ({
        from: (table: unknown) => ({
          where: async () => {
            statements.push(table);
            return table === permissionDenies ? [...denyRows] : [{ ...current, managedSystemId: null }];
          },
        }),
      }),
    }) as unknown as Db;
    const memo = memoizeCapabilityChecks(createCheckService({ db: handle(reads), now: () => now }));
    const point = (managed_system_id: string) =>
      memo.checkCapability(actor, 'finding.read', { workspace_id, managed_system_id });
    const north = await point('north');
    denyRows.push({ id: 'deny', managedSystemId: null });
    const batch = await checkCapabilityAcross(memo, actor, 'finding.read', systems);
    expect(north).toMatchObject({ allow: true, via: 'direct_grant' });
    expect(batch.get('north')).toBe(north);
    expect(batch.get('south')).toMatchObject({ allow: true, via: 'direct_grant' });
    expect(await point('south')).toBe(batch.get('south'));
    expect(reads).toHaveLength(2);
    const txReads: unknown[] = [];
    const transactional = await checkCapabilityAcross(memo, actor, 'finding.read', systems, { tx: handle(txReads) });
    expect(transactional.get('south')).toMatchObject({ allow: false, reason: 'explicit_deny' });
    expect(txReads).toHaveLength(2);
    expect(reads).toHaveLength(2);
  });

  it.each<Case>([
    { label: 'workspace deny', denyRows: [{ id: 'deny', managedSystemId: null }], grantRows: [current], expected: ['explicit_deny', 'explicit_deny'] },
    { label: 'system deny and grant', denyRows: [{ id: 'deny', managedSystemId: 'south' }], grantRows: [current], expected: ['managed_system_scope', 'explicit_deny'] },
    { label: 'expiry', grantRows: [{ ...current, expiresAt: now }], expected: ['grant_expired', 'no_grant'] },
    { label: 'revocation', grantRows: [{ ...current, revokedAt: now }], expected: ['grant_revoked', 'no_grant'] },
    { label: 'role derivation', role: 'admin', capability: 'workspace.read', expected: ['role', 'role'] },
    { label: 'User exclusion', role: 'user', capability: 'knowledge.catalog.manage', grantRows: [{ ...current, managedSystemId: null }], expected: ['no_grant', 'no_grant'] },
    { label: 'declared role allow-list', capability: 'ext.test.view', grantRows: [current], expected: ['no_grant', 'no_grant'] },
  ])('matches individual checks with $label', async ({ role = 'developer', capability = 'finding.read', denyRows = [], grantRows = [], expected }) => {
    const db = {
      select: () => ({
        from: (table: unknown) => ({ where: async () => table === permissionDenies ? denyRows : grantRows }),
      }),
    } as unknown as Db;
    const check = createCheckService({ db, now: () => now, capabilities });
    const actor = { actor_id: 'actor', workspace_id, role_level: role };
    const individual = new Map<string, Decision>();
    for (const managed_system_id of systems) {
      individual.set(managed_system_id, await check.checkCapability(actor, capability, { workspace_id, managed_system_id }));
    }
    expect([...individual.values()].map(decision => decision.allow ? decision.via : decision.reason)).toEqual(expected);
    expect(await check.checkCapabilityAcross(actor, capability, systems)).toEqual(individual);
  });
});
