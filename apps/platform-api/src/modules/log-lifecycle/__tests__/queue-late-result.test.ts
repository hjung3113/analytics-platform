import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../../../db/client.js';
import { createQueueService, LeaseLostError } from '../queue-service.js';

const mocks = vi.hoisted(() => ({
  lockRequest: vi.fn(), getAttempt: vi.fn(), subjectOf: vi.fn(), getQueueSettings: vi.fn(),
  finishAttemptSucceeded: vi.fn(), finishAttemptFailed: vi.fn(), finishRequest: vi.fn(),
  insertRuleResults: vi.fn(), reclaimLease: vi.fn(), record: vi.fn(),
}));
vi.mock('../repositories/queue-write.js', () => ({
  ...mocks,
  claimNext: vi.fn(), extendLease: vi.fn(), requeueExpiredLeases: vi.fn(),
}));
vi.mock('../repositories/queue-read.js', () => ({ countRuleResults: vi.fn() }));
vi.mock('../../core/audit/audit-service.js', () => ({ createAuditService: () => ({ record: mocks.record }) }));
vi.mock('../opinion-service.js', () => ({ createOpinionService: () => ({ record: vi.fn() }) }));
vi.mock('../diagnostic-service.js', () => ({ createDiagnosticService: () => ({ record: vi.fn() }) }));

const caller = { workspaceId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222', tokenId: null };
const requestId = '33333333-3333-4333-8333-333333333333';
const attemptId = '44444444-4444-4444-8444-444444444444';
const digest = 'a'.repeat(64);
const tx = {};
const db = { transaction: async (run: (handle: typeof tx) => unknown) => run(tx) } as unknown as Db;
const resultBody = { attemptNo: 1, inputManifestDigest: digest, results: [{ ruleId: 'synthetic-rule', required: true, result: 'PASS' }] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lockRequest.mockResolvedValue({ id: requestId, state: 'expired', attemptCount: 1 });
  mocks.getAttempt.mockResolvedValue({ id: attemptId, attemptNo: 1, outcome: 'lease_expired', workerActorId: caller.actorId });
  mocks.subjectOf.mockResolvedValue({ sampleSet: { files: [] }, sampleManifestDigest: digest });
  mocks.getQueueSettings.mockResolvedValue({ leaseSeconds: 300 });
  mocks.insertRuleResults.mockResolvedValue(0);
});

describe('SER-27 late result/fail eligibility under the request lock', () => {
  it.each(['queued', 'expired'] as const)('accepts result on the latest lease-expired attempt of %s', async (state) => {
    mocks.lockRequest.mockResolvedValue({ id: requestId, state, attemptCount: 1 });
    const result = await createQueueService({ db }).submitResult(caller, requestId, resultBody);
    expect(result).toMatchObject({ state: 'succeeded', verdict: 'pass' });
    expect(mocks.finishRequest).toHaveBeenCalledWith(tx, requestId, 'succeeded');
    expect(mocks.record).toHaveBeenCalledWith(tx, expect.objectContaining({ detail: expect.objectContaining({ late: true }) }));
  });

  it('accepts fail on the latest lease-expired attempt of expired', async () => {
    expect(await createQueueService({ db }).fail(caller, requestId, { attemptNo: 1 })).toMatchObject({ state: 'failed' });
    expect(mocks.finishRequest).toHaveBeenCalledWith(tx, requestId, 'failed');
    expect(mocks.record).toHaveBeenCalledWith(tx, expect.objectContaining({ detail: { attemptNo: 1, late: true } }));
  });

  it.each([
    { state: 'expired', attemptCount: 2, workerActorId: caller.actorId },
    { state: 'cancelled', attemptCount: 1, workerActorId: caller.actorId },
    { state: 'succeeded', attemptCount: 1, workerActorId: caller.actorId },
    { state: 'expired', attemptCount: 1, workerActorId: '55555555-5555-4555-8555-555555555555' },
  ])('refuses a lost lease: $state / attempt count $attemptCount / $workerActorId', async ({ workerActorId, ...request }) => {
    mocks.lockRequest.mockResolvedValue({ id: requestId, ...request });
    mocks.getAttempt.mockResolvedValue({ id: attemptId, attemptNo: 1, outcome: 'lease_expired', workerActorId });
    const service = createQueueService({ db });
    await expect(service.submitResult(caller, requestId, resultBody)).rejects.toBeInstanceOf(LeaseLostError);
    await expect(service.fail(caller, requestId, { attemptNo: 1 })).rejects.toBeInstanceOf(LeaseLostError);
    expect(mocks.finishRequest).not.toHaveBeenCalled();
  });

  it('refuses a heartbeat on expired without reclaiming the lease', async () => {
    await expect(createQueueService({ db }).heartbeat(caller, requestId, 1)).rejects.toBeInstanceOf(LeaseLostError);
    expect(mocks.reclaimLease).not.toHaveBeenCalled();
  });
});
