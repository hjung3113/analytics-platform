import { z } from 'zod';
import { VALIDATION_ISSUE_LIMITS as L } from '@ap/feature-shared';
import { ISSUE_STATES } from './validation-issue-states.js';

const id = z.string().uuid();
const page = { cursor: z.string().min(1).max(4096).optional(), limit: z.number().int().min(1).max(L.pageMax).default(L.pageDefault) };
const schemas = {
  // #1808 H3: `states` narrows the rows (not the per-state counts); each state at most once.
  validationIssues: z.object({ projectId: id.optional(), roundId: id.optional(), states: z.array(z.enum(ISSUE_STATES)).min(1).max(ISSUE_STATES.length).refine(v => new Set(v).size === v.length, 'duplicate').optional(), ...page }).strict(),
  validationIssueDetail: z.object({ issueId: id, ...page }).strict(),
  validationIssueThread: z.object({ issueId: id, ...page }).strict(),
  // `of: 'transitions'` pages the state transitions by seq; the default stays the field corrections.
  validationIssueHistory: z.object({ issueId: id, of: z.enum(['corrections', 'transitions']).optional(), ...page }).strict(),
  roundDiscussion: z.object({ roundId: id, ...page }).strict(),
};
export type ValidationIssueRead = keyof typeof schemas;
export const VALIDATION_ISSUE_PARAM_KEYS = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, Object.keys(schema.shape)])) as Record<ValidationIssueRead, string[]>;
export function parseValidationIssueParams<A extends ValidationIssueRead>(name: A, params: unknown): z.SafeParseReturnType<unknown, z.output<(typeof schemas)[A]>> {
  return schemas[name].safeParse(params) as z.SafeParseReturnType<unknown, z.output<(typeof schemas)[A]>>;
}
