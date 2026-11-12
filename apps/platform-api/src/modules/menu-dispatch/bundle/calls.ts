import { z } from 'zod';

import { bindingsSchema, type Binding } from './bindings.js';
import { sqlPlaceholders, startsReadStatement } from './sql-placeholders.js';

export const jsonPointerSchema = z.string().regex(/^(?:\/(?:[^~]|~[01])*)*$/, 'must be a JSON pointer');
const fieldsSchema = z.record(z.string().min(1), z.strictObject({ from: jsonPointerSchema, type: z.enum(['number', 'string', 'wallclock']).optional() }));
const responseSchema = z.strictObject({ rows: jsonPointerSchema.optional(), fields: fieldsSchema.optional(), total: jsonPointerSchema.optional() });
const sqlResponseSchema = z.strictObject({ fields: fieldsSchema.optional() });
const mappedSchema = z.strictObject({
  mode: z.literal('mapped'), method: z.enum(['GET', 'POST']),
  path: z.string().refine((value) => value.startsWith('/') && !value.startsWith('//') && !/[?#\\\s]/.test(value) && value.split('/').every((part) => {
    if (/^\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(part)) return true;
    return !/[{}]/.test(part) && !['.', '..'].includes(part.replace(/%2e/gi, '.'));
  }), 'path must be fixed and absolute with whole-segment {name} variables only'),
  pathParams: bindingsSchema.optional(), query: bindingsSchema.optional(), body: bindingsSchema.optional(),
  arrayStyle: z.union([z.strictObject({ mode: z.literal('repeat') }), z.strictObject({ mode: z.literal('join'), separator: z.string().min(1) })]).optional(),
  response: responseSchema,
}).superRefine((call, ctx) => {
  const variables = [...call.path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]);
  if (variables.some((key) => key === undefined || !Object.hasOwn(call.pathParams ?? {}, key)) || Object.keys(call.pathParams ?? {}).some((key) => !variables.includes(key))) {
    ctx.addIssue({ code: 'custom', path: ['pathParams'], message: 'path variables must match pathParams exactly' });
  }
});
const statementSchema = z.strictObject({ statement: z.string().min(1), params: bindingsSchema, response: sqlResponseSchema.optional() }).superRefine((call, ctx) => {
  if (!startsReadStatement(call.statement)) ctx.addIssue({ code: 'custom', path: ['statement'], message: 'statement must start with SELECT or WITH after whitespace/comments' });
  const names = sqlPlaceholders(call.statement);
  if (names.some((name) => !Object.hasOwn(call.params, name)) || Object.keys(call.params).some((name) => !names.includes(name))) {
    ctx.addIssue({ code: 'custom', path: ['params'], message: 'SQL placeholders must match params exactly' });
  }
});
const procedureSchema = z.strictObject({
  procedure: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,2}$/, 'procedure must have 1 to 3 identifier parts'),
  args: bindingsSchema, listJoin: z.record(z.string(), z.string().min(1)).optional(), response: sqlResponseSchema.optional(),
}).superRefine((call, ctx) => {
  if (Object.keys(call.listJoin ?? {}).some((key) => !Object.hasOwn(call.args, key))) ctx.addIssue({ code: 'custom', path: ['listJoin'], message: 'listJoin must name declared args' });
});
export const callSchema = z.union([z.strictObject({ mode: z.literal('envelope') }), mappedSchema, statementSchema, procedureSchema]);
export type Call = z.infer<typeof callSchema>;
export const callKind = (call: Call): 'http' | 'sql' => 'mode' in call ? 'http' : 'sql';
export const isEnvelope = (call: Call): boolean => 'mode' in call && call.mode === 'envelope';
export function callBindings(call: Call): Binding[] {
  if ('statement' in call) return Object.values(call.params);
  if ('procedure' in call) return Object.values(call.args);
  if (call.mode === 'envelope') return [];
  return [...Object.values(call.pathParams ?? {}), ...Object.values(call.query ?? {}), ...Object.values(call.body ?? {})];
}
