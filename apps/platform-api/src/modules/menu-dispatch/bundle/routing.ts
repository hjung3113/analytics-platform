import { z } from 'zod';

import { bindingSchema } from './bindings.js';
import { callSchema, jsonPointerSchema } from './calls.js';
import { valueMapSchema } from './targets.js';

export const ASSESSMENT_KINDS = ['collection', 'processing_delay', 'coverage', 'time_domain', 'respondent_history'] as const;
export const scopeCheckSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('verify-rows'), siteField: jsonPointerSchema.optional(), roomField: jsonPointerSchema }),
  z.strictObject({ mode: z.literal('drop-rows'), siteField: jsonPointerSchema.optional(), roomField: jsonPointerSchema }),
  z.strictObject({ mode: z.literal('resolve-keys'), lookup: callSchema, keys: bindingSchema, siteField: jsonPointerSchema, roomField: jsonPointerSchema }),
]);
export type ScopeCheck = z.infer<typeof scopeCheckSchema>;
export const routeSchema = z.strictObject({
  sites: z.array(z.string().min(1)).nonempty().optional(), rooms: z.array(z.string().min(1)).nonempty().optional(),
  targets: z.array(z.string().min(1)).nonempty(), call: callSchema.optional(), valueMap: valueMapSchema.optional(),
});
export const routingSchema = z.strictObject({
  routes: z.array(routeSchema).nonempty(), call: callSchema, scopeCheck: scopeCheckSchema.optional(),
  merge: z.strictObject({
    sort: z.array(z.strictObject({ field: z.string().min(1), direction: z.enum(['asc', 'desc']), unique: z.boolean().optional() })).nonempty().optional(),
    partial: z.literal('coverage').optional(), maxWindow: z.number().int().positive().optional(),
  }).optional(),
  unroutedRooms: z.enum(['skip', 'error']).default('error'),
});
export type Routing = z.infer<typeof routingSchema>;
export type Route = z.infer<typeof routeSchema>;
