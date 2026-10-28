import { apiResponseSchema, assessmentKindSchema, assessmentSchema, outcomeSchema, trustSchema } from './response.ts';
import { endpointDeclarationSchema, menuQueryContextSchema, menuQuerySchema } from './menu-query.ts';
import * as ports from './service-ports.ts';
import { z } from 'zod/v4';

export { apiResponseSchema, assessmentKindSchema, assessmentSchema, outcomeSchema, trustSchema } from './response.ts';
export { endpointDeclarationSchema, menuQueryContextSchema, menuQuerySchema } from './menu-query.ts';
export {
  createNoticeInputSchema,
  deleteNoticeInputSchema,
  groupMemberSchema,
  jsonValueSchema,
  noticeListPageSchema,
  noticeSchema,
  peopleLookupRequestSchema,
  peopleLookupResponseSchema,
  preferenceKeySchema,
  preferencesImportSchema,
  preferencesPatchSchema,
  preferencesSnapshotSchema,
  saveNoticeInputSchema,
  updateNoticeInputSchema,
  PEOPLE_LOOKUP_MAX,
  PREFERENCE_KEYS_MAX,
  PREFERENCE_REQUEST_MAX_BYTES,
  PREFERENCE_VALUE_MAX_BYTES,
  jsonBytes,
} from './service-ports.ts';
export type { JsonValue } from './service-ports.ts';
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
  jsonValue: ports.jsonValueSchema,
  preferenceKey: ports.preferenceKeySchema,
  preferencesSnapshot: ports.preferencesSnapshotSchema,
  preferencesPatch: ports.preferencesPatchSchema,
  preferencesImport: ports.preferencesImportSchema,
  groupMember: ports.groupMemberSchema,
  peopleLookupRequest: ports.peopleLookupRequestSchema,
  peopleLookupResponse: ports.peopleLookupResponseSchema,
  notice: ports.noticeSchema,
  noticeListPage: ports.noticeListPageSchema,
  createNoticeInput: ports.createNoticeInputSchema,
  updateNoticeInput: ports.updateNoticeInputSchema,
  saveNoticeInput: ports.saveNoticeInputSchema,
  deleteNoticeInput: ports.deleteNoticeInputSchema,
};
