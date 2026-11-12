import { z } from 'zod';

import type { ContextKey } from '../types.js';

/** JSON constants, never expressions, templates or executable values. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const jsonSchema: z.ZodType<Json> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonSchema), z.record(jsonSchema),
]));
export const bindingSchema = z.union([
  z.string().regex(/^(?:scope\.(?:site|rooms)|context\.[A-Za-z_][A-Za-z0-9_]*|params\.[A-Za-z_][A-Za-z0-9_]*)$/, 'binding must use the closed vocabulary'),
  z.strictObject({ const: jsonSchema }),
]);
export type Binding = z.infer<typeof bindingSchema>;
export const bindingsSchema = z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), bindingSchema);

const enumValues = z.array(z.union([z.string(), z.number().finite(), z.boolean()])).nonempty().optional();
export const paramTypeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('string'), maxLength: z.number().int().positive().optional(), enum: enumValues }),
  z.strictObject({ type: z.literal('number'), enum: enumValues }),
  z.strictObject({ type: z.literal('boolean'), enum: enumValues }),
  z.strictObject({ type: z.literal('string[]'), maxLength: z.number().int().positive().optional(), maxItems: z.number().int().positive().optional(), enum: enumValues }),
]).superRefine((param, ctx) => {
  const expected = param.type === 'string[]' ? 'string' : param.type;
  if (param.enum?.some((value) => typeof value !== expected)) {
    ctx.addIssue({ code: 'custom', path: ['enum'], message: 'enum values must match the declared param type' });
  }
});
export type ParamType = z.infer<typeof paramTypeSchema>;

/** Local mirror of the wire projection; the drift test compares it with appliedContextFields. */
export const CONTEXT_WIRE_FIELDS: Readonly<Record<ContextKey, readonly string[]>> = {
  time: ['from', 'to'], roomNames: ['roomNames'], line: ['lineNames'], prcGroup: ['prcGroups'],
  condition: ['condition'], selection: ['selection'], lot: ['lotIds'], ppid: ['ppid'], recipe: ['recipeIds'], metric: ['metricId', 'metricVersion'],
};

export function bindingProblems(bindings: readonly Binding[], endpoint: {
  context: Partial<Record<ContextKey, unknown>>;
  paramKeys: readonly string[];
  paramTypes?: Record<string, ParamType> | undefined;
}): string[] {
  const problems: string[] = [];
  const applied = new Set(Object.entries(CONTEXT_WIRE_FIELDS).flatMap(([key, fields]) => endpoint.context[key as ContextKey] === 'apply' ? [...fields] : []));
  if (endpoint.context.condition === 'apply' || endpoint.context.prcGroup === 'apply') applied.add('membershipBasis');
  for (const binding of bindings) {
    if (typeof binding !== 'string') continue;
    if (binding.startsWith('context.') && !applied.has(binding.slice(8))) problems.push(`binding ${binding}: context wire field is not applied`);
    if (binding.startsWith('params.') && (!endpoint.paramKeys.includes(binding.slice(7)) || !Object.hasOwn(endpoint.paramTypes ?? {}, binding.slice(7)))) {
      problems.push(`binding ${binding}: param must be declared in paramKeys and paramTypes`);
    }
  }
  return [...new Set(problems)];
}
