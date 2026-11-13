import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseValidationIssueInput } from '../domain/validation-issue-input.js';
import { VALIDATION_ISSUE_LIMITS as L } from '@ap/feature-shared';

const ID = '00000000-0000-4000-8000-000000000001';
const issue = { projectId: ID, firstRoundId: ID, title: 'Synthetic observation', body: 'Expected sequence absent' };

describe('validation issue intake', () => {
  it('accepts a rule-free issue and strips controls like opinion intake', () => {
    const parsed = parseValidationIssueInput('create', { ...issue, title: ' A\u0000B ', body: ' A\u0007B\nC\tD ' });
    expect(parsed.success && parsed.data).toMatchObject({ title: 'AB', body: 'AB\nC\tD' });
  });
  it.each([
    ['title', L.title], ['body', L.body], ['expected', L.body], ['actual', L.body], ['repro', L.body],
  ] as const)('rejects oversized %s without truncation, counting Unicode characters', (field, max) => {
    expect(parseValidationIssueInput('create', { ...issue, [field]: '😀'.repeat(max) }).success).toBe(true);
    expect(parseValidationIssueInput('create', { ...issue, [field]: '😀'.repeat(max + 1) }).success).toBe(false);
  });
  it.each(['title', 'body', 'expected', 'actual', 'repro'])('rejects secrets in %s', (field) => {
    expect(parseValidationIssueInput('create', { ...issue, [field]: 'Bearer abcdefghijklmnopqrstuvwxyz123456' }).success).toBe(false);
  });
  it('rejects unknown state fields and empty required prose', () => {
    expect(parseValidationIssueInput('create', { ...issue, status: 'resolved' }).success).toBe(false);
    expect(parseValidationIssueInput('create', { ...issue, body: '\u0000 ' }).success).toBe(false);
  });
  it('bounds comments and requires an attempt for a rule result', () => {
    expect(parseValidationIssueInput('commentIssue', { issueId: ID, body: 'x'.repeat(L.comment) }).success).toBe(true);
    expect(parseValidationIssueInput('commentRound', { roundId: ID, body: 'x'.repeat(L.comment + 1) }).success).toBe(false);
    expect(parseValidationIssueInput('linkOccurrence', { issueId: ID, roundId: ID, ruleResultId: ID }).success).toBe(false);
  });
  it('reuses evidence intake, lowercases hashes and caps pointers', () => {
    const ref = { fileRef: 'synthetic.log', line: 1, fileSha256: 'A'.repeat(64) };
    const parsed = parseValidationIssueInput('linkEvidence', { occurrenceId: ID, refs: [ref] });
    expect(parsed.success && parsed.data).toMatchObject({ refs: [{ ...ref, fileSha256: 'a'.repeat(64) }] });
    expect(parseValidationIssueInput('linkEvidence', { occurrenceId: ID, refs: [{ ...ref, line: 0 }] }).success).toBe(false);
    expect(parseValidationIssueInput('linkEvidence', { occurrenceId: ID, refs: Array.from({ length: 21 }, (_, i) => ({ ...ref, line: i + 1 })) }).success).toBe(false);
  });
  it('bounds field corrections by the corrected field and refuses state fields', () => {
    expect(parseValidationIssueInput('correctField', { issueId: ID, field: 'title', body: 'x'.repeat(201) }).success).toBe(false);
    expect(parseValidationIssueInput('correctField', { issueId: ID, field: 'body', body: '' }).success).toBe(false);
    expect(parseValidationIssueInput('correctField', { issueId: ID, field: 'expected', body: '' }).success).toBe(true);
    expect(parseValidationIssueInput('correctField', { issueId: ID, field: 'status', body: 'resolved' }).success).toBe(false);
  });
  it('mirrors the SQL length bounds and keeps page limits explicit', () => {
    const sql = readFileSync(new URL('../../../../migrations/0128_validation_issues.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`between 1 and ${L.title}`);
    expect(sql).toContain(`between 1 and ${L.body}`);
    expect(sql).toContain(`between 1 and ${L.comment}`);
    for (const field of ['expected', 'actual', 'repro']) {
      expect(sql).toContain(`"${field}"), 0) <= ${L.body}`);
    }
    // Existing-parent uniqueness must precede the FK that uses it (drizzle emits the reverse order).
    expect(sql.indexOf('ADD CONSTRAINT "validation_round_ownership_uq"')).toBeLessThan(sql.indexOf('ADD CONSTRAINT "validation_issue_first_round_fk"'));
    expect(sql.indexOf('ADD CONSTRAINT "execution_request_ownership_uq"')).toBeLessThan(sql.indexOf('ADD CONSTRAINT "validation_issue_occurrence_request_fk"'));
    expect(L).toMatchObject({ evidencePerOccurrence: 20, pageDefault: 50, pageMax: 100 });
  });
});
