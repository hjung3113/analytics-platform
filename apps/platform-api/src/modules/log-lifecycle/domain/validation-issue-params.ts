import { z } from 'zod';
import { VALIDATION_ISSUE_LIMITS as L } from './validation-issue-limits.js';

const id = z.string().uuid();
const page = { cursor: z.string().min(1).max(4096).optional(), limit: z.number().int().min(1).max(L.pageMax).default(L.pageDefault) };
const schemas = {
  validationIssues: z.object({ projectId: id.optional(), roundId: id.optional(), ...page }).strict(),
  validationIssueDetail: z.object({ issueId: id, ...page }).strict(),
  validationIssueThread: z.object({ issueId: id, ...page }).strict(),
  validationIssueHistory: z.object({ issueId: id, ...page }).strict(),
  roundDiscussion: z.object({ roundId: id, ...page }).strict(),
};
export type ValidationIssueRead = keyof typeof schemas;
export const VALIDATION_ISSUE_PARAM_KEYS = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, Object.keys(schema.shape)])) as Record<ValidationIssueRead, string[]>;
export function parseValidationIssueParams<A extends ValidationIssueRead>(name: A, params: unknown): z.SafeParseReturnType<unknown, z.output<(typeof schemas)[A]>> {
  return schemas[name].safeParse(params) as z.SafeParseReturnType<unknown, z.output<(typeof schemas)[A]>>;
}
