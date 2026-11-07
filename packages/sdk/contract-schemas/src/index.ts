import { apiResponseSchema, assessmentKindSchema, assessmentSchema, outcomeSchema, trustSchema } from './response.ts';
import { endpointDeclarationSchema, menuQueryContextSchema, menuQuerySchema } from './menu-query.ts';
import { columnFilterSchema, columnFilterSpecSchema } from './column-filter.ts';
import * as ports from './service-ports.ts';
import * as views from './saved-view-commands.ts';
import * as tokens from './api-token.ts';
import { z } from 'zod/v4';

export { apiResponseSchema, assessmentKindSchema, assessmentSchema, outcomeSchema, trustSchema } from './response.ts';
export { endpointDeclarationSchema, menuQueryContextSchema, menuQuerySchema } from './menu-query.ts';
export { columnFilterSchema, columnFilterSpecSchema } from './column-filter.ts';
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
  questSchema,
  questSearchInputSchema,
  questSearchPageSchema,
  QUEST_QUERY_MAX,
  QUEST_SEARCH_PAGE_SIZE_MAX,
  PEOPLE_LOOKUP_MAX,
  PREFERENCE_KEYS_MAX,
  PREFERENCE_REQUEST_MAX_BYTES,
  PREFERENCE_VALUE_MAX_BYTES,
  jsonBytes,
} from './service-ports.ts';
export type { JsonValue } from './service-ports.ts';
export {
  SAVED_VIEW_COMMAND_MAX_BYTES,
  SAVED_VIEW_COMMAND_MAX_DEPTH,
  SAVED_VIEW_COMMAND_VERSION,
  SAVED_VIEW_IMPORT_ROWS_MAX,
  SAVED_VIEW_TOKEN_MAX,
  isForbiddenSavedViewWireKey,
  savedViewCommandSchema,
  savedViewDraftSchema,
  savedViewEntrySchema,
  savedViewImportOutcomeSchema,
  savedViewListItemSchema,
  savedViewPatchSchema,
  savedViewResponseSchemas,
  savedViewSchema,
  viewVisibilitySchema,
} from './saved-view-commands.ts';
export type { SavedViewCommand, SavedViewOp } from './saved-view-commands.ts';
export {
  API_TOKEN_ERROR_CODES,
  API_TOKEN_VERSION,
  apiTokenItemSchema,
  apiTokenKindSchema,
  apiTokenPageSchema,
  apiTokenValueSchema,
  issuePersonalApiTokenInputSchema,
  issueServiceApiTokenInputSchema,
  issuedApiTokenSchema,
} from './api-token.ts';
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
  columnFilter: columnFilterSchema,
  columnFilterSpec: columnFilterSpecSchema,
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
  quest: ports.questSchema,
  questSearchInput: ports.questSearchInputSchema,
  questSearchPage: ports.questSearchPageSchema,
  savedViewCommand: views.savedViewCommandSchema,
  savedViewDraft: views.savedViewDraftSchema,
  savedViewPatch: views.savedViewPatchSchema,
  viewVisibility: views.viewVisibilitySchema,
  savedView: views.savedViewSchema,
  savedViewEntry: views.savedViewEntrySchema,
  savedViewListItem: views.savedViewListItemSchema,
  savedViewImportOutcome: views.savedViewImportOutcomeSchema,
  apiTokenKind: tokens.apiTokenKindSchema,
  apiTokenValue: tokens.apiTokenValueSchema,
  apiTokenItem: tokens.apiTokenItemSchema,
  apiTokenPage: tokens.apiTokenPageSchema,
  issuePersonalApiTokenInput: tokens.issuePersonalApiTokenInputSchema,
  issueServiceApiTokenInput: tokens.issueServiceApiTokenInputSchema,
  issuedApiToken: tokens.issuedApiTokenSchema,
};
