// #1496 R-f fix: a failing RuleSet catalog lookup never takes `requestDetail` down; the attempts say `unavailable`.
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/queue-read.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../repositories/queue-read.js')>()),
  getRequestDetail: vi.fn(),
}));

import type { LogLifecycleDeps } from '../deps.js';
import { requestEndpoints } from '../request-endpoints.js';
import { getRequestDetail } from '../repositories/queue-read.js';

const REQUEST_ID = randomUUID();
const actor = { actor_id: randomUUID(), workspace_id: randomUUID() };
const attempt = (id: string, ruleSetRevision: string | null) => ({ id, ruleSetRevision });

function declaration(findRuleSetRevision: (tx: unknown) => Promise<unknown>) {
  const tx = { marker: 'core-read' };
  const db = { transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const deps = { db, ruleCoverage: { findRuleSetRevision } } as unknown as LogLifecycleDeps;
  const found = requestEndpoints(deps).find((e) => e.spec.id === 'logLifecycle.requestDetail');
  if (!found) throw new Error('requestDetail is not declared');
  return { found, db, tx };
}

describe('logLifecycle.requestDetail with a failing catalog lookup (#1496)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers ok with every attempt and ruleSet unavailable; the lookup runs outside the core read transaction', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(getRequestDetail).mockResolvedValue({ id: REQUEST_ID, attempts: [attempt('a1', 'v1'), attempt('a2', null), attempt('a3', 'v2')] } as never);
    const lookupHandles: unknown[] = [];
    const { found, db, tx } = declaration(async (handle) => {
      lookupHandles.push(handle);
      throw new Error('statement timeout SECRET-TOKEN row-data');
    });
    const result = await found.handle({ actor, params: { requestId: REQUEST_ID } } as never);
    expect(result.outcome).toBe('ok');
    const attempts = (result.data as { attempts: { id: string; ruleSet: unknown }[] }).attempts;
    expect(attempts.map((a) => [a.id, a.ruleSet])).toEqual([
      ['a1', { state: 'unavailable' }],
      ['a2', null],
      ['a3', { state: 'unavailable' }],
    ]);
    // The lookups got the pool handle, not the transaction handle of the core read.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(lookupHandles).toHaveLength(2);
    expect(lookupHandles.every((h) => h === db && h !== tx)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET-TOKEN|row-data|v1|v2/);
  });

  it('a request that does not exist is still ok with null data', async () => {
    vi.mocked(getRequestDetail).mockResolvedValue(null as never);
    const { found } = declaration(async () => {
      throw new Error('never called');
    });
    expect(await found.handle({ actor, params: { requestId: REQUEST_ID } } as never)).toMatchObject({ outcome: 'ok', data: null });
  });
});
