import { z } from 'zod/v4';
import { APPLIED_CAPABILITIES, ASSESSMENT_KINDS, CONTEXT_KEYS } from './vocab.ts';

/** Naive wall-clock `YYYY-MM-DDTHH:mm:ss` (06 §6.3): no Z, offset, fraction or date-only. Calendar validity is not expressible here. */
const wallClock = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
/** null = key absent (no explicit constraint); [] = explicit empty set; otherwise sorted unique IDs. */
const idSet = z.array(z.string()).nullable();
/** App-owned axis IDs mapped to the selected values. */
const condition = z.record(z.string(), z.array(z.string()));

/** Request Context: only declared `apply` keys and `scopeId` are present, so every field is optional. */
export const menuQueryContextSchema = z.object({
  scopeId: z.string().nullable().optional(),
  from: wallClock.nullable().optional(),
  to: wallClock.nullable().optional(),
  roomNames: idSet.optional(),
  condition: condition.nullable().optional(),
  lineNames: idSet.optional(),
  prcGroups: idSet.optional(),
  membershipBasis: z.literal('asOf').nullable().optional(),
  selection: idSet.optional(),
  lotIds: idSet.optional(),
  ppid: z.string().nullable().optional(),
  recipeIds: idSet.optional(),
  metricId: z.string().nullable().optional(),
  metricVersion: z.string().nullable().optional(),
});

/** Request sent to the transport; permission, kinds and compute are not included. */
export const menuQuerySchema = z.object({
  endpoint: z.string(),
  context: menuQueryContextSchema,
  params: z.unknown(),
});

const contextCapabilities = z.object(
  Object.fromEntries(CONTEXT_KEYS.map((key) => [key, z.enum(APPLIED_CAPABILITIES).optional()])) as {
    [K in (typeof CONTEXT_KEYS)[number]]: z.ZodOptional<z.ZodEnum<{ apply: 'apply'; reference: 'reference' }>>;
  },
);

/**
 * The data part of `EndpointSpec` — what `endpoints.json` holds. `paramKeys` is the list of keys of the runtime allow-list
 * (`Object.keys(spec.paramKeys)`); the phantom `_types` has no runtime value and is omitted.
 */
export const endpointDeclarationSchema = z.object({
  id: z.string(),
  menuId: z.string(),
  paramKeys: z.array(z.string()),
  permission: z.string(),
  requiresScope: z.boolean(),
  context: contextCapabilities,
  requiredContext: z.array(z.enum(CONTEXT_KEYS)).optional(),
  kinds: z.array(z.enum(ASSESSMENT_KINDS)),
  limits: z.object({ maxHours: z.number().optional(), maxRows: z.number().optional() }).optional(),
  mergeTimeDomain: z.boolean(),
});
