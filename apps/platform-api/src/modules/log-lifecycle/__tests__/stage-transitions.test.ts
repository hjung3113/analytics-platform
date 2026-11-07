import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LEGAL_STAGE_PAIRS, STAGES, canSetStage, reopenTarget } from '../domain/stage-transitions.js';

describe('canSetStage', () => {
  it.each([
    ['registered', 'kickoff'],
    ['kickoff', 'alpha'],
    ['alpha', 'beta'],
    ['registered', 'cancelled'],
    ['kickoff', 'cancelled'],
    ['alpha', 'cancelled'],
    ['beta', 'cancelled'],
  ])('%s -> %s is ok', (from, to) => {
    expect(canSetStage(from, to)).toBe('ok');
  });

  it.each(['registered', 'kickoff', 'alpha', 'beta', 'completed', 'cancelled'])('%s -> completed needs the Gate', (from) => {
    expect(canSetStage(from, 'completed')).toBe('gate_required');
  });

  it.each([
    ['registered', 'registered'],
    ['registered', 'alpha'],
    ['registered', 'beta'],
    ['kickoff', 'registered'],
    ['beta', 'alpha'],
    ['beta', 'beta'],
    ['cancelled', 'registered'],
    ['cancelled', 'cancelled'],
    ['completed', 'beta'],
    ['completed', 'cancelled'],
    ['alpha', 'unknown'],
    ['unknown', 'kickoff'],
  ])('%s -> %s is illegal', (from, to) => {
    expect(canSetStage(from, to)).toBe('illegal_transition');
  });
});

describe('reopenTarget', () => {
  it.each(['registered', 'kickoff', 'alpha', 'beta'])('cancelled returns to the stage before the cancel (%s)', (before) => {
    expect(reopenTarget('cancelled', before)).toBe(before);
  });
  it('completed returns to beta', () => {
    expect(reopenTarget('completed', null)).toBe('beta');
  });
  it.each([
    ['cancelled', null],
    ['cancelled', 'completed'],
    ['cancelled', 'cancelled'],
    ['registered', 'alpha'],
    ['beta', null],
  ])('%s with %s before is not reopenable', (from, before) => {
    expect(reopenTarget(from, before)).toBeNull();
  });
});

describe('LEGAL_STAGE_PAIRS vs the guard trigger SQL (drift)', () => {
  // The migration that defines `log_lifecycle.project_guard` (its file name is a drizzle-generated tag).
  const dir = new URL('../../../../migrations/', import.meta.url);
  const file = readdirSync(dir).find((f) => f.endsWith('.sql') && readFileSync(new URL(f, dir), 'utf8').includes('log_lifecycle.project_guard()'));

  it('finds the migration', () => {
    expect(file).toBeDefined();
  });

  it('lists exactly the same from -> to pairs', () => {
    const sql = readFileSync(new URL(file as string, dir), 'utf8');
    const block = /-- LEGAL_STAGE_PAIRS begin\n([\s\S]*?)-- LEGAL_STAGE_PAIRS end/.exec(sql)?.[1] ?? '';
    const fromSql: Record<string, string[]> = {};
    for (const m of block.matchAll(/OLD\.stage = '(\w+)' AND NEW\.stage IN \(([^)]*)\)/g)) {
      fromSql[m[1] as string] = [...(m[2] as string).matchAll(/'(\w+)'/g)].map((x) => x[1] as string);
    }
    expect(Object.keys(fromSql).sort()).toEqual([...STAGES].filter((s) => LEGAL_STAGE_PAIRS[s].length > 0).sort());
    for (const stage of STAGES) expect(fromSql[stage], stage).toEqual([...LEGAL_STAGE_PAIRS[stage]]);
  });

  it('every pair the service can produce is in the table', () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        if (canSetStage(from, to) === 'ok') expect(LEGAL_STAGE_PAIRS[from]).toContain(to);
      }
    }
    for (const before of ['registered', 'kickoff', 'alpha', 'beta']) {
      expect(LEGAL_STAGE_PAIRS.cancelled).toContain(reopenTarget('cancelled', before));
    }
    expect(LEGAL_STAGE_PAIRS.completed).toContain(reopenTarget('completed', null));
    expect(LEGAL_STAGE_PAIRS.beta).toContain('completed');
  });
});
