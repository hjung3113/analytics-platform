import { z } from 'zod/v4';
import { APPLIED_CAPABILITIES, ASSESSMENT_KINDS, CONTEXT_KEYS } from './vocab.ts';

/** Naive wall-clock `YYYY-MM-DDTHH:mm:ss` (06 §6.3): no Z, offset, fraction or date-only. Calendar validity is not expressible here. */
const wallClock = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
/**
 * A non-blank ID (06 §6.1): at least one character outside Python `str.isspace()` (the contracts `identifier` set) and valid
 * Unicode (no lone surrogate). IDs are never trimmed, case-folded or normalized. The pattern is the representable part; the
 * lone-surrogate check is runtime-only.
 */
const id = z
  .string()
  .regex(/[^\t-\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/)
  .refine(
    (value) => {
      try {
        encodeURIComponent(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'ID must be valid Unicode' },
  );
/** Distinct IDs. Canonical code-point order is a server boundary requirement: JSON Schema cannot express it. */
const distinct = <T extends z.ZodType<string[]>>(list: T) =>
  list.refine((values) => new Set(values).size === values.length, { message: 'IDs must be distinct' }).meta({ uniqueItems: true });
const distinctIds = distinct(z.array(id));
/** null = key absent (no explicit constraint); [] = explicit empty set; otherwise distinct non-blank IDs. */
const idSet = distinctIds.nullable();
/** App-owned axis IDs mapped to the selected values: at least one axis, each with at least one value (kernel 06 §6.1). */
const condition = z
  .record(id, distinct(z.array(id).min(1)))
  .refine((axes) => Object.keys(axes).length > 0, { message: 'Condition needs at least one axis' })
  .meta({ minProperties: 1 });

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

/** `unsupported` is the absence of a key, so only the applied capabilities are values. */
export const contextCapabilitySchema = z.enum(APPLIED_CAPABILITIES);

const contextCapabilities = z.object(
  Object.fromEntries(CONTEXT_KEYS.map((key) => [key, contextCapabilitySchema.optional()])) as {
    [K in (typeof CONTEXT_KEYS)[number]]: z.ZodOptional<typeof contextCapabilitySchema>;
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
  limits: z.object({ maxHours: z.number().optional(), maxRows: z.number().int().positive().optional() }).optional(),
  mergeTimeDomain: z.boolean(),
});
