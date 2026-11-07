// ADR-0123 (#1466): the Managed-System rule keeps its meaning for Managed-System tuples (a NULL end never matches), and the
// one no-Managed-System write path judges BOTH ends by the owning module's read permission. No DB: the insert is a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import type { EntityLinkProvider, EntityLinkProviderRegistry } from '../provider-types.js';

const insertActiveEntityLink = vi.fn();
vi.mock('../repo.js', async (importActual) => ({
  ...(await importActual<typeof import('../repo.js')>()),
  insertActiveEntityLink: (...args: unknown[]) => insertActiveEntityLink(...args),
}));

const { assertLinkManagedSystemCompatibility, createEntityLinksService } = await import('../service.js');

const WS = '11111111-1111-4111-8111-111111111111';
const ATT = '22222222-2222-4222-8222-222222222222';
const ROUND = '33333333-3333-4333-8333-333333333333';
const actor = { actor_id: '44444444-4444-4444-8444-444444444444', workspace_id: WS, role_level: 'developer' as const };
const source = { type: 'manual_validation_attachment', id: ATT } as const;
const target = { type: 'validation_round', id: ROUND } as const;

function provider(
  entityType: EntityLinkProvider['entityType'],
  opts: { exists?: boolean; readable?: boolean; managedSystemId?: string | null } = {},
): EntityLinkProvider {
  const row = { workspace_id: WS, managed_system_id: opts.managedSystemId ?? null, reporter_id: null };
  return {
    entityType,
    assertExists: async () => (opts.exists === false ? null : row),
    getPermissionSubject: async () => (opts.exists === false ? null : row),
    canRead: async () => opts.readable !== false,
    getReporterSummary: async () => ({ available: false }),
    getInternalSummary: async () => null,
    listExpectedLinks: async () => [],
  };
}

function build(overrides: Partial<EntityLinkProviderRegistry> = {}) {
  const audit = vi.fn();
  const providers = {
    manual_validation_attachment: provider('manual_validation_attachment'),
    validation_round: provider('validation_round'),
    ...overrides,
  } as unknown as EntityLinkProviderRegistry;
  const service = createEntityLinksService({
    db: {} as Db,
    checkService: { checkCapability: vi.fn(), capabilityScope: vi.fn() } as never,
    auditService: { record: audit } as never,
    providers,
  } as never);
  return { service, audit };
}

const create = (service: ReturnType<typeof build>['service'], relation_type = 'evidence_of' as const) =>
  service.createNoManagedSystemLink({ actor, source, target, relation_type, tx: {} as Tx });

beforeEach(() => {
  insertActiveEntityLink.mockReset();
  insertActiveEntityLink.mockResolvedValue({ row: { id: 'link-1' }, inserted: true });
});

describe('assertLinkManagedSystemCompatibility (ADR-0123: pre-existing rule unchanged)', () => {
  const MS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const MS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  it('accepts the same Managed System', () => {
    expect(() => assertLinkManagedSystemCompatibility(MS_A, MS_A)).not.toThrow();
  });
  it.each([
    ['different Managed Systems', MS_A, MS_B],
    ['a NULL source end', null, MS_A],
    ['a NULL target end', MS_A, null],
    ['two NULL ends on a Managed-System tuple', null, null],
  ])('refuses %s with managed_system_mismatch', (_label, a, b) => {
    expect(() => assertLinkManagedSystemCompatibility(a, b)).toThrowError(
      expect.objectContaining({ code: 'validation.failed', detail: { fields: [{ path: ['target', 'id'], code: 'managed_system_mismatch' }] } }),
    );
  });
});

describe('createNoManagedSystemLink', () => {
  it('persists the registered pair with a NULL Managed System and audits one entity_link.created', async () => {
    const { service, audit } = build();
    await expect(create(service)).resolves.toEqual({ id: 'link-1', inserted: true });
    expect(insertActiveEntityLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: WS,
        sourceType: 'manual_validation_attachment',
        sourceId: ATT,
        targetType: 'validation_round',
        targetId: ROUND,
        relationType: 'evidence_of',
        managedSystemId: null,
        createdBy: actor.actor_id,
        visibility: 'internal_only',
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event_type: 'entity_link.created',
        subject_id: 'link-1',
        detail: { link_id: 'link-1', source, target, relation_type: 'evidence_of', visibility: 'internal_only' },
      }),
    );
  });

  it('writes no audit row for an existing active link', async () => {
    insertActiveEntityLink.mockResolvedValue({ row: { id: 'link-1' }, inserted: false });
    const { service, audit } = build();
    await expect(create(service)).resolves.toEqual({ id: 'link-1', inserted: false });
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([
    ['the attachment end is not readable', { manual_validation_attachment: provider('manual_validation_attachment', { readable: false }) }],
    ['the Round end is not readable', { validation_round: provider('validation_round', { readable: false }) }],
    ['the attachment end does not resolve', { manual_validation_attachment: provider('manual_validation_attachment', { exists: false }) }],
    ['the Round end does not resolve (other workspace / unknown)', { validation_round: provider('validation_round', { exists: false }) }],
  ])('answers the same not-found and writes nothing when %s', async (_label, overrides) => {
    const { service, audit } = build(overrides);
    await expect(create(service)).rejects.toMatchObject({ code: 'not_found.record' });
    expect(insertActiveEntityLink).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([
    ['source', { manual_validation_attachment: undefined }],
    ['target', { validation_round: undefined }],
  ])('denies with the uniform not-found when the %s provider is missing (default-deny)', async (_label, overrides) => {
    const { service, audit } = build(overrides as never);
    await expect(create(service)).rejects.toMatchObject({
      code: 'not_found.record',
      message: 'entity link endpoint not found',
    });
    expect(insertActiveEntityLink).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('refuses a pair where one end carries a Managed System, after both ends were judged readable', async () => {
    const { service } = build({ validation_round: provider('validation_round', { managedSystemId: 'ms-1' }) });
    await expect(create(service)).rejects.toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['target', 'id'], code: 'managed_system_mismatch' }] },
    });
    expect(insertActiveEntityLink).not.toHaveBeenCalled();
  });

  it.each([
    ['an unregistered relation on the registered ends', { source, target, relation_type: 'related_to' as const }],
    ['a Managed-System end paired with a Round', { source: { type: 'voc', id: ATT } as const, target, relation_type: 'evidence_of' as const }],
    ['the reverse direction', { source: target, target: source, relation_type: 'evidence_of' as const }],
  ])('refuses %s as an unsupported tuple', async (_label, input) => {
    const { service } = build();
    await expect(service.createNoManagedSystemLink({ actor, ...input, tx: {} as Tx })).rejects.toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: [], code: 'unsupported_tuple' }] },
    });
    expect(insertActiveEntityLink).not.toHaveBeenCalled();
  });

  it('the generic create path refuses the no-Managed-System pair (command-only)', async () => {
    const { service } = build();
    await expect(
      service.createLink({ actor, source, target, relation_type: 'evidence_of' }),
    ).rejects.toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: [], code: 'unsupported_tuple' }] } });
    expect(insertActiveEntityLink).not.toHaveBeenCalled();
  });
});
