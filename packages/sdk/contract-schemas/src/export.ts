import { z } from 'zod/v4';

/**
 * One schema as a JSON Schema 2020-12 document. Zod's output is kept as emitted: no key sorting, no `pattern` clean-up.
 * One addition: a fixed tuple. Zod emits only `prefixItems`, which constrains positions that exist but accepts a shorter
 * or longer array, so the export closes it (`minItems`/`maxItems` = length, `items: false`) to match the TS tuple.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    override: ({ jsonSchema }) => {
      const { prefixItems } = jsonSchema;
      if (Array.isArray(prefixItems) && jsonSchema.items === undefined && jsonSchema.minItems === undefined) {
        jsonSchema.minItems = prefixItems.length;
        jsonSchema.maxItems = prefixItems.length;
        jsonSchema.items = false;
      }
    },
  }) as Record<string, unknown>;
}

/** The text of a committed schema file: two-space JSON and a trailing newline. */
export const schemaFileText = (schema: z.ZodType): string => `${JSON.stringify(toJsonSchema(schema), null, 2)}\n`;
