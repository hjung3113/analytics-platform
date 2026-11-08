import { describe, expect, it, vi } from 'vitest';

import { specCoverageEndpoint } from '../spec-coverage-endpoint.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const SW = '44444444-4444-4444-8444-444444444444';
const actor = { actor_id: 'a', workspace_id: 'ws' };
const run = (getCoverage: ReturnType<typeof vi.fn> | null, params: Record<string, unknown>) =>
  specCoverageEndpoint({ db: {} as never, checkService: {} as never, ...(getCoverage ? { ruleCoverage: { getCoverage } } : {}) }).handle({ actor, params } as never);

describe('logKnowledge.specCoverage (#1496)', () => {
  it('is declared on the models menu with the modelSpec right', () => {
    const e = specCoverageEndpoint({ db: {} as never, checkService: {} as never });
    expect(e.spec).toMatchObject({ id: 'logKnowledge.specCoverage', menuId: 'log-knowledge-models', permission: 'platform:view', requiresScope: false });
    expect([...e.spec.paramKeys]).toEqual(['modelId', 'softwareId']);
    expect(e.validate?.({}).ok).toBe(false);
    expect(e.validate?.({ modelId: UUID, softwareId: 'x' }).ok).toBe(false);
    expect(e.validate?.({ modelId: UUID, softwareId: SW }).ok).toBe(true);
  });

  it('computable: counts by state, the asked ids passed to the port', async () => {
    const getCoverage = vi.fn().mockResolvedValue({
      computable: true,
      coverageDigest: 'dg',
      requirements: [{ key: 'a', state: 'no_rule' }, { key: 'b', state: 'no_rule' }, { key: 'c', state: 'covered' }],
    });
    const out = await run(getCoverage, { modelId: UUID, softwareId: SW });
    expect(getCoverage).toHaveBeenCalledWith(expect.anything(), 'ws', UUID, SW);
    expect(out).toEqual({
      outcome: 'ok',
      data: { computable: true, counts: { no_rule: 2, unsupported: 0, unknown: 0, partial: 0, covered: 1, total: 3 }, coverageDigest: 'dg' },
    });
  });

  it.each(['no_catalog', 'no_spec', 'ambiguous_key', 'no_requirement_ids'])('not computable %s: the reason, never zeros', async (reason) => {
    const out = await run(vi.fn().mockResolvedValue({ computable: false, reason }), { modelId: UUID });
    expect(out).toEqual({ outcome: 'ok', data: { computable: false, reason } });
  });

  it('an unknown model answers data null (also the answer for a model the caller cannot see)', async () => {
    expect(await run(vi.fn().mockResolvedValue({ computable: false, reason: 'model_unknown' }), { modelId: UUID })).toEqual({ outcome: 'ok', data: null });
  });

  it('no port wired: unavailable, not a coverage number', async () => {
    expect(await run(null, { modelId: UUID })).toEqual({ outcome: 'ok', data: { computable: false, reason: 'unavailable' } });
  });
});
