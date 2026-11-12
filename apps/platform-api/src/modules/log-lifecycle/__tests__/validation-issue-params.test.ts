import { describe, expect, it } from 'vitest';
import { parseValidationIssueParams } from '../domain/validation-issue-params.js';

const id = '00000000-0000-4000-8000-000000000001';
describe('human validation issue query params', () => {
  it('defaults pages to 50 and accepts the maximum 100', () => {
    expect(parseValidationIssueParams('validationIssues', {})).toMatchObject({ success: true, data: { limit: 50 } });
    expect(parseValidationIssueParams('validationIssues', { projectId: id, roundId: id, limit: 100 }).success).toBe(true);
  });
  it.each([0, 101, 1.5, '50', null])('refuses invalid page limit %s', limit => {
    expect(parseValidationIssueParams('validationIssues', { limit }).success).toBe(false);
  });
  it.each(['validationIssueDetail', 'validationIssueThread', 'validationIssueHistory', 'roundDiscussion'] as const)('requires the target of %s', name => {
    const field = name === 'roundDiscussion' ? 'roundId' : 'issueId';
    expect(parseValidationIssueParams(name, {}).success).toBe(false);
    expect(parseValidationIssueParams(name, { [field]: 'invalid' }).success).toBe(false);
    expect(parseValidationIssueParams(name, { [field]: id }).success).toBe(true);
    expect(parseValidationIssueParams(name, { [field]: id, verdict: 'pass' }).success).toBe(false);
  });
  it('bounds cursors and rejects unknown keys and malformed filters', () => {
    for (const params of [{ cursor: '' }, { cursor: 'a'.repeat(4097) }, { projectId: 'x' }, { status: 'open' }, { actorId: id }, { workspaceId: id }]) {
      expect(parseValidationIssueParams('validationIssues', params).success).toBe(false);
    }
  });
  // #1808 H3
  it('filters issues by distinct known states and pages history by corrections or transitions', () => {
    expect(parseValidationIssueParams('validationIssues', { projectId: id, states: ['reported', 'on_hold'] }).success).toBe(true);
    for (const states of [[], ['done'], ['reported', 'reported'], 'reported']) expect(parseValidationIssueParams('validationIssues', { states }).success).toBe(false);
    expect(parseValidationIssueParams('validationIssueHistory', { issueId: id, of: 'transitions' }).success).toBe(true);
    expect(parseValidationIssueParams('validationIssueHistory', { issueId: id, of: 'verdicts' }).success).toBe(false);
  });
});
