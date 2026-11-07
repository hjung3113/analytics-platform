// Suite-level proof that the reusable contract suite does not demand more than an adapter advertises (C8, C12): a target with only
// some optional capabilities, and one with smaller limits, must pass the whole suite.
import { describe, expect, it } from 'vitest';
import type { SourceDescribeResponse } from '@ap/contract-schemas';

import { createSyntheticScenario, SYNTHETIC_LEAK_MARKER } from '../adapters/synthetic/index.js';
import { SourceReadError } from '../errors.js';
import type { SourceReadPort } from '../ports/source-read.js';
import { runSourceReadContract, type ContractScenario, type SourceReadContractTarget } from '../testing/source-read-contract.js';

type Cap = 'getParsed' | 'getPeriods' | 'getTopViewLink';

function restricted(base: SourceReadPort, opts: { without: readonly Cap[]; maxWindow?: number }): SourceReadPort {
  const hide = new Set<string>(opts.without);
  const reason = { getParsed: 'parser_not_connected', getPeriods: 'periods_not_supported', getTopViewLink: 'top_view_not_connected' } as const;
  const maxWindow = opts.maxWindow;
  return {
    ...base,
    describe: async (request, c): Promise<SourceDescribeResponse> => {
      const res = await base.describe(request, c);
      if (res.status !== 'ok') return res;
      return {
        ...res,
        capabilities: res.capabilities.filter((cap) => !hide.has(cap)),
        limits: maxWindow === undefined ? res.limits : { ...res.limits, maxWindow },
      };
    },
    getWindow: async (request, c) => {
      if (maxWindow !== undefined && (request.before > maxWindow || request.after > maxWindow)) throw new SourceReadError('invalid_request');
      return base.getWindow(request, c);
    },
    getParsed: async (request, c) => {
      const res = await base.getParsed(request, c);
      return hide.has('getParsed') && res.status === 'ok' ? { status: 'unsupported', reason: reason.getParsed } : res;
    },
    getPeriods: async (request, c) => {
      const res = await base.getPeriods(request, c);
      return hide.has('getPeriods') && res.status === 'ok' ? { status: 'unsupported', reason: reason.getPeriods } : res;
    },
    getTopViewLink: async (request, c) => {
      const res = await base.getTopViewLink(request, c);
      return hide.has('getTopViewLink') && res.status === 'ok' ? { status: 'unsupported', reason: reason.getTopViewLink } : res;
    },
  };
}

function targetOf(name: string, opts: { without: readonly Cap[]; maxWindow?: number }): SourceReadContractTarget {
  return {
    name,
    synthetic: true,
    failureMarker: SYNTHETIC_LEAK_MARKER,
    setup(scenario: ContractScenario) {
      const { port, sampleSet } = createSyntheticScenario(scenario);
      const fileRef = sampleSet.files[0]?.fileRef ?? '';
      return { port: restricted(port, opts), sampleSet, probe: { fileRef, line: scenario === 'many_rows' ? 160 : 5 } };
    },
  };
}

// periods supported; parsed and Top View absent. Every scenario, `unsupported` included, comes from that same partial adapter.
runSourceReadContract({ describe, it, expect } as never, targetOf('partial: periods only', { without: ['getParsed', 'getTopViewLink'] }));
// smaller advertised window: asks above it are refused, asks within it must return the full window.
runSourceReadContract({ describe, it, expect } as never, targetOf('partial: maxWindow 50', { without: [], maxWindow: 50 }));

describe('partial targets are really partial', () => {
  it('the periods-only target lacks parsed and Top View, the small-window target advertises 50', async () => {
    const f = targetOf('x', { without: ['getParsed', 'getTopViewLink'], maxWindow: 50 }).setup('typical');
    const { port, sampleSet } = (await f) as NonNullable<Awaited<typeof f>>;
    const d = await port.describe({ sourceOwner: sampleSet.sourceOwner }, { signal: new AbortController().signal, timeBudgetMs: 1000 });
    if (d.status !== 'ok') throw new Error('describe_not_ok');
    expect(d.capabilities).not.toContain('getParsed');
    expect(d.capabilities).toContain('getPeriods');
    expect(d.limits.maxWindow).toBe(50);
  });
});
