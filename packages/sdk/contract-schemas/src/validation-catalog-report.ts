import { z } from 'zod/v4';

// Validation catalog report contract, `v0` (#1491, ADR-0122, design docs/design/features/log-rules/README.md §5.1).
// PROVISIONAL until the in-house Validator is surveyed: names and limits may change without compatibility. Wire:
//   POST /api/v1/validation-catalog/report   Authorization: Bearer <service token with scope validation.catalog.report>
// The report is a full snapshot of what the Validator supports. The platform stores identifiers, short display text,
// support level and the declared targets only: there is no field for a rule body, condition, threshold, parameter or
// script, and every object is closed (an unknown key anywhere is refused as `unknown_field`).
// Runtime-only (not expressible here): 2 MB body bound (checked before parsing), duplicate keys, control characters
// and secret patterns inside free text (a control character is refused as `control_character`, never stripped). Those are refused with the error codes below.

export const VALIDATION_CATALOG_REPORT_VERSION = 'v0';
export const VALIDATION_CATALOG_REPORT_PATH = '/api/v1/validation-catalog/report';

export const VALIDATION_CATALOG_REPORT_LIMITS = {
  bodyBytes: 2 * 1024 * 1024,
  ruleSets: 50,
  rules: 5000,
  targetsPerRule: 20,
  requirementIds: 50,
  identifier: 200,
  title: 120,
  summary: 300,
  target: 500,
  format: 40,
  scopeItems: 50,
  scopeItem: 200,
} as const;
const L = VALIDATION_CATALOG_REPORT_LIMITS;

/** Field-level refusal codes of the 422 `validation.failed` answer (`detail.fields[].code`); the same code is recorded as the reject reason. */
export const VALIDATION_CATALOG_REPORT_FIELD_CODES = [
  'unknown_field',
  'invalid_identifier',
  'invalid_value',
  'invalid_json',
  'duplicate_key',
  'too_large',
  'secret_pattern',
  'control_character',
] as const;
/** Error envelope codes this route can answer. A cookie session or a token holder without the right gets `permission.denied`. */
export const VALIDATION_CATALOG_REPORT_ERROR_CODES = [
  'auth.token_invalid',
  'permission.denied',
  'validation.failed',
  'rate_limited.actor',
] as const;

/** 1–200 characters, no leading or trailing whitespace, no control characters; compared byte for byte, never normalized. */
export const catalogIdentifierSchema = z
  .string()
  .min(1)
  .max(L.identifier)
  .regex(/^[^\s\x00-\x1f\x7f](?:[^\x00-\x1f\x7f]*[^\s\x00-\x1f\x7f])?$/);

const text = (max: number) => z.string().min(1).max(max);

export const catalogSupportSchema = z.enum(['supported', 'partial', 'unsupported', 'unknown']);
export const catalogRevisionStatusSchema = z.enum(['active', 'retired']);

const scopeList = z.array(text(L.scopeItem)).max(L.scopeItems);
export const catalogRuleScopeSchema = z.strictObject({
  logTypes: scopeList.optional(),
  processes: scopeList.optional(),
  modelIds: scopeList.optional(),
  softwareRange: text(L.scopeItem).optional(),
  inputFormats: scopeList.optional(),
});

export const catalogRuleTargetSchema = z.strictObject({
  format: text(L.format),
  target: text(L.target),
  requirementIds: z.array(text(L.identifier)).max(L.requirementIds).optional(),
});

export const catalogRuleSchema = z.strictObject({
  ruleKey: catalogIdentifierSchema,
  title: text(L.title),
  summary: text(L.summary),
  support: catalogSupportSchema,
  scope: catalogRuleScopeSchema.optional(),
  requiredDefault: z.boolean().optional(),
  targets: z.array(catalogRuleTargetSchema).max(L.targetsPerRule).optional(),
});

export const catalogRuleSetSchema = z.strictObject({
  ruleSetKey: catalogIdentifierSchema,
  revision: catalogIdentifierSchema,
  resultRef: catalogIdentifierSchema.optional(),
  status: catalogRevisionStatusSchema,
  supersedes: catalogIdentifierSchema.optional(),
  rules: z.array(catalogRuleSchema).max(L.rules),
});

export const validationCatalogReportSchema = z.strictObject({
  sourceSystem: catalogIdentifierSchema,
  validatorVersion: catalogIdentifierSchema,
  ruleSets: z.array(catalogRuleSetSchema).max(L.ruleSets),
});

/** 200 for both a new report and a replay (`replayed`); `current` is false when a newer report has superseded it. */
export const validationCatalogReportResponseSchema = z.strictObject({
  reportId: z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/),
  outcome: z.literal('accepted'),
  replayed: z.boolean(),
  current: z.boolean(),
});
