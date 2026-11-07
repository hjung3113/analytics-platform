import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DRAFT_STATUSES,
  FINAL_DRAFT_STATUSES,
  LEGAL_DRAFT_STATUS_PAIRS,
  canSubmit,
  canWithdraw,
  isEditableStatus,
} from '../domain/draft-transitions.js';

describe('draft transitions', () => {
  it.each(['draft', 'changes_requested'])('%s can be submitted', (from) => {
    expect(canSubmit(from)).toBe(true);
  });
  it.each(['submitted', 'approved', 'rejected', 'withdrawn', 'unknown'])('%s cannot be submitted', (from) => {
    expect(canSubmit(from)).toBe(false);
  });
  it.each(['draft', 'submitted', 'changes_requested'])('%s can be withdrawn', (from) => {
    expect(canWithdraw(from)).toBe(true);
  });
  it.each(['approved', 'rejected', 'withdrawn'])('%s is final: no withdraw, no edit, no way out', (from) => {
    expect(canWithdraw(from)).toBe(false);
    expect(isEditableStatus(from)).toBe(false);
    expect(LEGAL_DRAFT_STATUS_PAIRS[from as (typeof DRAFT_STATUSES)[number]]).toEqual([]);
    expect(FINAL_DRAFT_STATUSES).toContain(from);
  });
  it.each(['draft', 'submitted', 'changes_requested'])('%s is editable', (from) => {
    expect(isEditableStatus(from)).toBe(true);
  });
});

describe('LEGAL_DRAFT_STATUS_PAIRS vs the guard trigger SQL (drift)', () => {
  const dir = new URL('../../../../migrations/', import.meta.url);
  const file = readdirSync(dir).find((f) => f.endsWith('.sql') && readFileSync(new URL(f, dir), 'utf8').includes('knowledge.draft_guard()'));

  it('finds the migration', () => {
    expect(file).toBeDefined();
  });

  it('lists exactly the same from -> to pairs', () => {
    const sql = readFileSync(new URL(file as string, dir), 'utf8');
    const block = /-- LEGAL_DRAFT_STATUS_PAIRS begin\n([\s\S]*?)-- LEGAL_DRAFT_STATUS_PAIRS end/.exec(sql)?.[1] ?? '';
    const fromSql: Record<string, string[]> = {};
    for (const m of block.matchAll(/OLD\.status = '(\w+)' AND NEW\.status IN \(([^)]*)\)/g)) {
      fromSql[m[1] as string] = [...(m[2] as string).matchAll(/'(\w+)'/g)].map((x) => x[1] as string);
    }
    expect(Object.keys(fromSql).sort()).toEqual([...DRAFT_STATUSES].filter((s) => LEGAL_DRAFT_STATUS_PAIRS[s].length > 0).sort());
    for (const status of DRAFT_STATUSES) {
      if (LEGAL_DRAFT_STATUS_PAIRS[status].length > 0) expect(fromSql[status], status).toEqual([...LEGAL_DRAFT_STATUS_PAIRS[status]]);
    }
  });

  it('the status CHECK of the table lists exactly the statuses', () => {
    const sql = readFileSync(new URL(file as string, dir), 'utf8');
    const check = /"draft_status_check" CHECK \([^)]*in \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    expect([...check.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual([...DRAFT_STATUSES]);
  });

  it('every pair the node a service can produce is in the table', () => {
    for (const from of DRAFT_STATUSES) {
      if (canSubmit(from)) expect(LEGAL_DRAFT_STATUS_PAIRS[from]).toContain('submitted');
      if (canWithdraw(from)) expect(LEGAL_DRAFT_STATUS_PAIRS[from]).toContain('withdrawn');
    }
  });
});
