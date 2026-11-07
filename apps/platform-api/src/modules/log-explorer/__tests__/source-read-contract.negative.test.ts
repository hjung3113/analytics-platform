// Negative controls for the reusable suite: its assertions must FAIL for a faulty adapter, or a green run proves nothing.
import { describe, expect, it } from 'vitest';

import { SourceReadError } from '../errors.js';
import { createSyntheticScenario } from '../adapters/synthetic/index.js';
import { timeBudgetViolation, unsupportedViolation, type Settled } from '../testing/source-read-contract.js';
import type { SourceReadPort } from '../ports/source-read.js';

const ctx = (timeBudgetMs: number) => ({ signal: new AbortController().signal, timeBudgetMs });

async function outcomeOf(port: SourceReadPort, budgetMs: number): Promise<{ outcome: Settled; elapsed: number }> {
  const { sampleSet } = createSyntheticScenario('typical');
  const started = Date.now();
  try {
    return { outcome: { kind: 'value', value: await port.searchRecords({ sampleSet, query: {}, cursor: null, limit: 10 }, ctx(budgetMs)) }, elapsed: Date.now() - started };
  } catch (error) {
    return { outcome: { kind: 'error', error }, elapsed: Date.now() - started };
  }
}

describe('contract suite negative controls', () => {
  const normal = createSyntheticScenario('typical').port;
  const ignoresBudget: SourceReadPort = {
    ...normal,
    searchRecords: async (request, c) => {
      await new Promise((resolve) => setTimeout(resolve, 80)); // slower than the 50 ms budget, answers in full anyway
      return normal.searchRecords(request, c);
    },
  };

  it('timeBudgetViolation fails an adapter that answers fully after its budget', async () => {
    const { outcome, elapsed } = await outcomeOf(ignoresBudget, 50);
    expect(outcome.kind).toBe('value');
    expect(timeBudgetViolation(outcome, elapsed)).toMatch(/complete answer/);
  });
  it('timeBudgetViolation fails a malformed value and the wrong error code, and accepts the two allowed endings', () => {
    expect(timeBudgetViolation({ kind: 'value', value: 'late' }, 80)).not.toBeNull();
    expect(timeBudgetViolation({ kind: 'error', error: new SourceReadError('adapter_failed') }, 80)).not.toBeNull();
    expect(timeBudgetViolation({ kind: 'error', error: new Error('time_budget_exceeded') }, 80)).not.toBeNull();
    expect(timeBudgetViolation({ kind: 'error', error: new SourceReadError('time_budget_exceeded') }, 80)).toBeNull();
    expect(timeBudgetViolation({ kind: 'value', value: { status: 'ok', rows: [], nextCursor: null, partial: true } }, 80)).toBeNull();
    expect(timeBudgetViolation({ kind: 'value', value: { status: 'ok', rows: [], nextCursor: null, partial: false } }, 80)).not.toBeNull();
  });
  it('timeBudgetViolation accepts a conforming slow adapter', async () => {
    const { port } = createSyntheticScenario('slow');
    const { outcome, elapsed } = await outcomeOf(port, 50);
    expect(timeBudgetViolation(outcome, elapsed)).toBeNull();
  });
  it('unsupportedViolation fails a fake result, a free-text reason and another capability\'s reason', () => {
    expect(unsupportedViolation('getParsed', { status: 'ok' })).not.toBeNull();
    expect(unsupportedViolation('getParsed', { status: 'unsupported', reason: 'the parser said <body>' })).not.toBeNull();
    expect(unsupportedViolation('getParsed', { status: 'unsupported', reason: 'top_view_not_connected' })).not.toBeNull();
    expect(unsupportedViolation('getParsed', { status: 'unsupported', reason: 'capability_missing' })).toBeNull();
    expect(unsupportedViolation('getParsed', { status: 'unsupported', reason: 'parser_not_connected' })).toBeNull();
  });
});
