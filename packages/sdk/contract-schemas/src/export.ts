import { z } from 'zod/v4';

/** One schema as a JSON Schema 2020-12 document. Zod's output is kept as emitted: no key sorting, no `pattern` clean-up. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
}

/** The text of a committed schema file: two-space JSON and a trailing newline. */
export const schemaFileText = (schema: z.ZodType): string => `${JSON.stringify(toJsonSchema(schema), null, 2)}\n`;
