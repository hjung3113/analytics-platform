import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('human validation records stay independent of machine decisions', () => {
  it.each(['../domain/verdict.ts', '../domain/gate-rules.ts', '../domain/gate-input.ts', '../gate-actions.ts', '../gate-availability.ts', '../repositories/gate.ts', '../suite-result-read-port.ts', '../suite-request-port.ts', '../domain/result-payload.ts', '../domain/request-states.ts'])('%s never consults human records', rel => {
    expect(readFileSync(new URL(rel, import.meta.url), 'utf8')).not.toMatch(/validation_issue|validationIssue|validation-issue|round_comment|roundComments/);
  });
  it.each(['../validation-issue-actions.ts', '../validation-issue-endpoints.ts', '../validation-issue-service.ts', '../validation-issue-read.ts', '../repositories/validation-issue-read.ts', '../repositories/validation-issue-write.ts', '../domain/validation-issue-states.ts', '../domain/validation-issue-input.ts', '../domain/validation-issue-params.ts'])('%s makes no decision from machine opinions or verdicts', rel => {
    expect(readFileSync(new URL(rel, import.meta.url), 'utf8')).not.toMatch(/attempt_opinion|attemptOpinions|\.verdict\b|\.result\b|gate_decision|gateDecisions/);
  });
});
