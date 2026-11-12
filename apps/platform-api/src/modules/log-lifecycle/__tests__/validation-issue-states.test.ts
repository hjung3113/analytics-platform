// #1808 H3: the issue state table, its required inputs, the derivation of the current state, the single permission rule,
// and the drift between LEGAL_ISSUE_PAIRS and the guard trigger / CHECK SQL of its migration.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseValidationIssueInput } from '../domain/validation-issue-input.js';
import {
  CLOSED_ISSUE_STATES, ISSUE_STATES, LEGAL_ISSUE_PAIRS, OPEN_ISSUE_STATES, canMoveIssue, currentIssueState, judgeTransition, transitionPolicy,
  type IssueState, type TransitionInput,
} from '../domain/validation-issue-states.js';

const ID = '00000000-0000-4000-8000-000000000001';
const none: TransitionInput = { reason: null, assigneeActorId: null, basisCommentId: null, occurrenceId: null, duplicateOfIssueId: null };
const LEGAL: [IssueState, IssueState][] = [
  ['reported', 'investigating'], ['reported', 'dismissed'],
  ['investigating', 'fix_requested'], ['investigating', 'vendor_inquiry'], ['investigating', 'on_hold'], ['investigating', 'by_design'], ['investigating', 'waived'], ['investigating', 'dismissed'],
  ['fix_requested', 'investigating'], ['fix_requested', 'vendor_inquiry'], ['fix_requested', 'on_hold'], ['fix_requested', 'waived'], ['fix_requested', 'fix_verified'],
  ['vendor_inquiry', 'investigating'], ['vendor_inquiry', 'fix_requested'], ['vendor_inquiry', 'on_hold'], ['vendor_inquiry', 'by_design'], ['vendor_inquiry', 'waived'],
  ['on_hold', 'investigating'],
  ['fix_verified', 'investigating'],
];
const key = (from: string, to: string) => `${from}->${to}`;
const legal = new Set(LEGAL.map(([f, t]) => key(f, t)));
const allPairs = ISSUE_STATES.flatMap((from) => ISSUE_STATES.map((to) => [from, to] as [IssueState, IssueState]));

describe('issue states', () => {
  it('keeps nine states, five open and four closed, and none of the reserved names', () => {
    expect([...OPEN_ISSUE_STATES, ...CLOSED_ISSUE_STATES].sort()).toEqual([...ISSUE_STATES].sort());
    expect(OPEN_ISSUE_STATES).toContain('on_hold');
    for (const reserved of ['done', 'verified', 'dropped', 'confirmed', 'changes_requested']) expect(ISSUE_STATES).not.toContain(reserved);
  });
  it.each(allPairs)('%s -> %s follows the legality table', (from, to) => {
    expect(canMoveIssue(from, to)).toBe(legal.has(key(from, to)));
    expect(judgeTransition(from, to, 2, none).some((r) => r.code === 'illegal_transition')).toBe(!legal.has(key(from, to)));
  });
  it.each(['by_design', 'waived', 'dismissed'] as const)('%s is terminal', (state) => {
    expect(LEGAL_ISSUE_PAIRS[state]).toEqual([]);
  });
  it('derives reported without a transition and the last to_state otherwise', () => {
    expect(currentIssueState(null)).toBe('reported');
    expect(currentIssueState(undefined)).toBe('reported');
    expect(currentIssueState('on_hold')).toBe('on_hold');
  });
});

describe('required inputs', () => {
  const full = (over: Partial<TransitionInput> = {}): TransitionInput => ({ reason: 'r', assigneeActorId: ID, basisCommentId: null, occurrenceId: null, duplicateOfIssueId: null, ...over });
  it('the first move to investigating needs an assignee but no reason', () => {
    expect(judgeTransition('reported', 'investigating', 1, { ...none, assigneeActorId: ID })).toEqual([]);
    expect(judgeTransition('reported', 'investigating', 1, none)).toEqual([{ path: 'assigneeActorId', code: 'required' }]);
  });
  it('dismissed from reported needs a reason only, and may name a duplicate', () => {
    expect(judgeTransition('reported', 'dismissed', 1, none)).toEqual([{ path: 'reason', code: 'required' }]);
    expect(judgeTransition('reported', 'dismissed', 1, { ...none, reason: 'dup', duplicateOfIssueId: ID })).toEqual([]);
  });
  it.each(LEGAL.filter(([from]) => from !== 'reported'))('%s -> %s needs a reason and an assignee', (from, to) => {
    const refusals = judgeTransition(from, to, 2, none).map((r) => r.path);
    expect(refusals).toContain('reason');
    expect(refusals).toContain('assigneeActorId');
  });
  it.each([['investigating', 'on_hold'], ['investigating', 'waived'], ['fix_requested', 'waived'], ['vendor_inquiry', 'by_design'], ['vendor_inquiry', 'on_hold']] as const)('%s -> %s needs a basis comment', (from, to) => {
    expect(judgeTransition(from, to, 2, full())).toEqual([{ path: 'basisCommentId', code: 'required' }]);
    expect(judgeTransition(from, to, 2, full({ basisCommentId: ID }))).toEqual([]);
  });
  it('by_design straight from investigating needs no basis comment', () => {
    expect(judgeTransition('investigating', 'by_design', 2, full())).toEqual([]);
  });
  it('fix_verified needs an occurrence; other moves refuse one', () => {
    expect(judgeTransition('fix_requested', 'fix_verified', 3, full())).toEqual([{ path: 'occurrenceId', code: 'required' }]);
    expect(judgeTransition('fix_requested', 'fix_verified', 3, full({ occurrenceId: ID }))).toEqual([]);
    expect(judgeTransition('investigating', 'fix_requested', 2, full({ occurrenceId: ID }))).toEqual([{ path: 'occurrenceId', code: 'not_allowed' }]);
  });
  it('a duplicate is named only with dismissed', () => {
    expect(judgeTransition('investigating', 'fix_requested', 2, full({ duplicateOfIssueId: ID }))).toEqual([{ path: 'duplicateOfIssueId', code: 'not_allowed' }]);
    expect(judgeTransition('investigating', 'dismissed', 2, full({ duplicateOfIssueId: ID }))).toEqual([]);
  });
});

describe('transition permission policy (one function)', () => {
  it.each(ISSUE_STATES.filter((s) => s !== 'waived'))('%s needs triage only', (to) => {
    expect(transitionPolicy(to)).toEqual({ capabilities: ['lifecycle.issue.triage'], humanOnly: false });
  });
  it('waived also needs the Gate right and a human', () => {
    expect(transitionPolicy('waived')).toEqual({ capabilities: ['lifecycle.issue.triage', 'lifecycle.gate.decide'], humanOnly: true });
  });
});

describe('changeState input', () => {
  it('accepts plain text and optional ids, rejects unknown keys, verdicts and unknown states', () => {
    expect(parseValidationIssueInput('changeState', { issueId: ID, toState: 'investigating', assigneeActorId: ID }).success).toBe(true);
    expect(parseValidationIssueInput('changeState', { issueId: ID, toState: 'done' }).success).toBe(false);
    expect(parseValidationIssueInput('changeState', { issueId: ID, toState: 'fix_verified', verdict: 'pass' }).success).toBe(false);
    expect(parseValidationIssueInput('changeState', { issueId: ID, toState: 'on_hold', reason: 'x'.repeat(4001) }).success).toBe(false);
    expect(parseValidationIssueInput('changeState', { issueId: ID, toState: 'on_hold', reason: 'password=hunter2hunter2' }).success).toBe(false);
  });
  it('normalizes an empty reason to null', () => {
    expect(parseValidationIssueInput('changeState', { issueId: ID, toState: 'investigating', reason: '  ' })).toMatchObject({ success: true, data: { reason: null } });
  });
});

describe('LEGAL_ISSUE_PAIRS vs the migration SQL (drift)', () => {
  const dir = new URL('../../../../migrations/', import.meta.url);
  const file = readdirSync(dir).find((f) => f.endsWith('.sql') && readFileSync(new URL(f, dir), 'utf8').includes('log_lifecycle.validation_issue_transition_guard()'));
  const text = () => readFileSync(new URL(file as string, dir), 'utf8');

  it('finds the migration', () => {
    expect(file).toBeDefined();
  });
  it('the guard trigger lists exactly the same from -> to pairs', () => {
    const block = /-- LEGAL_ISSUE_PAIRS begin\n([\s\S]*?)-- LEGAL_ISSUE_PAIRS end/.exec(text())?.[1] ?? '';
    const fromSql: Record<string, string[]> = {};
    for (const m of block.matchAll(/NEW\.from_state = '(\w+)' AND NEW\.to_state IN \(([^)]*)\)/g)) {
      fromSql[m[1] as string] = [...(m[2] as string).matchAll(/'(\w+)'/g)].map((x) => x[1] as string);
    }
    expect(Object.keys(fromSql).sort()).toEqual(ISSUE_STATES.filter((s) => LEGAL_ISSUE_PAIRS[s].length > 0).sort());
    for (const state of ISSUE_STATES) expect(fromSql[state] ?? [], state).toEqual([...LEGAL_ISSUE_PAIRS[state]]);
  });
  it('the state CHECK lists the states in the domain order', () => {
    const list = /"validation_issue_transition_state_check" CHECK \([^)]*?in \(([^)]*)\)/.exec(text())?.[1] ?? '';
    expect([...list.matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual([...ISSUE_STATES]);
  });
});
