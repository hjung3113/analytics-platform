import { apiResponseSchema, assessmentKindSchema, assessmentSchema, outcomeSchema, trustSchema } from './response.ts';
import { endpointDeclarationSchema, menuQueryContextSchema, menuQuerySchema } from './menu-query.ts';
import { z } from 'zod/v4';

export { apiResponseSchema, assessmentKindSchema, assessmentSchema, outcomeSchema, trustSchema } from './response.ts';
export { endpointDeclarationSchema, menuQueryContextSchema, menuQuerySchema } from './menu-query.ts';
export { schemaFileText, toJsonSchema } from './export.ts';

/**
 * Every schema that becomes a file under `schemas/`, by file name. `apiResponse` is the factory applied to `z.unknown()`,
 * so its `data` is `{}` (any value) or null.
 */
export const SCHEMA_FILES: Readonly<Record<string, z.ZodType>> = {
  outcome: outcomeSchema,
  assessmentKind: assessmentKindSchema,
  assessment: assessmentSchema,
  trust: trustSchema,
  apiResponse: apiResponseSchema(z.unknown()),
  menuQueryContext: menuQueryContextSchema,
  menuQuery: menuQuerySchema,
  endpointDeclaration: endpointDeclarationSchema,
};
