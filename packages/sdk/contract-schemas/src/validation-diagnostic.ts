import { z } from 'zod/v4';
import { validationOpinionEvidenceSchema } from './validation-opinion.ts';

// ADR-0159, schemaVersion 1. Source ACL, normalized digests, secret detection, sample/rule membership,
// producer count, duplicate keys, declared column types/keys and aggregate 512 KiB are server checks. No attachment surface in this version.
const key = z.string().regex(/^[a-z0-9_]{1,32}$/);
const producer = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const itemKey = z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/);
// JSON Schema length counts code points; use the same measure at runtime (rather than UTF-16 units).
const text = (min: number, max: number) => z.string().refine((value) => [...value].length >= min && [...value].length <= max).meta({ minLength: min, maxLength: max });
const cell = z.union([text(0, 500), z.number().finite(), z.boolean(), z.null()]);
export const validationDiagnosticColumnSchema = z.strictObject({ key, label: text(1, 80), type: z.enum(['string', 'number', 'boolean']) });
export const validationDiagnosticTableSchema = z.strictObject({ tableKey: key, title: text(0, 200).optional(), columns: z.array(validationDiagnosticColumnSchema).min(1).max(16), rows: z.array(z.record(key, cell)).max(200) });
const itemFields = { itemKey, title: text(1, 200), explanation: text(0, 4000).optional(), evidenceRefs: z.array(validationOpinionEvidenceSchema).max(20).optional(), tables: z.array(validationDiagnosticTableSchema).max(4).optional() };
export const validationDiagnosticItemSchema = z.discriminatedUnion('origin', [
  z.strictObject({ ...itemFields, origin: z.literal('rule'), ruleId: text(1, 200) }),
  z.strictObject({ ...itemFields, origin: z.literal('analysis'), ruleId: text(1, 200).optional() }),
]);
export const validationDiagnosticInputSchema = z.strictObject({ schemaVersion: z.literal(1), producer, producerVersion: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/), inputManifestDigest: z.string().regex(/^[0-9a-f]{64}$/), items: z.array(validationDiagnosticItemSchema).min(1).max(500) });
export const validationDiagnosticResponseSchema = z.strictObject({ requestId: z.string().uuid(), attemptNo: z.number().int().positive(), producer, itemCount: z.number().int().min(1).max(500), duplicate: z.boolean() });
export const validationDiagnosticBodyStateSchema = z.enum(['live', 'erased_retention', 'erased_admin']);
export const validationDiagnosticListParamsSchema = z.strictObject({ attemptId: z.string().uuid(), ruleResultId: z.string().uuid().optional(), page: z.number().int().min(0).max(1000000).optional(), pageSize: z.number().int().min(1).max(100).optional() });
export const validationDiagnosticItemParamsSchema = z.strictObject({ attemptId: z.string().uuid(), producer, itemKey, tableKey: key.optional(), rowOffset: z.number().int().nonnegative().optional() });
const identity = { producer, itemKey, origin: z.enum(['rule', 'analysis']), ruleResultId: z.string().uuid().nullable(), bodyState: validationDiagnosticBodyStateSchema };
export const validationDiagnosticListSchema = z.strictObject({ access: z.enum(['granted', 'no_permission']), documents: z.array(z.strictObject({ producer, producerVersion: z.string(), schemaVersion: z.literal(1), itemCount: z.number().int().min(1).max(500), createdAt: z.iso.datetime({ offset: true }) })), rows: z.array(z.strictObject({ ...identity, evidenceCount: z.number().int().min(0).max(20), tableCount: z.number().int().min(0).max(4), rowCounts: z.array(z.number().int().min(0).max(200)).max(4), title: text(1, 200).nullable() })).max(100), total: z.number().int().nonnegative() });
export const validationDiagnosticItemResponseSchema = z.strictObject({ item: z.strictObject({ ...identity, title: text(1, 200).nullable(), explanation: text(0, 4000).nullable(), evidenceRefs: z.array(validationOpinionEvidenceSchema).max(20), tables: z.array(z.strictObject({ tableKey: key, title: text(0, 200).nullable(), columns: z.array(validationDiagnosticColumnSchema.extend({ label: text(1, 80).nullable() })).min(1).max(16), totalRows: z.number().int().min(0).max(200), rowOffset: z.number().int().nonnegative(), rows: z.array(z.record(key, cell)).max(100) })).max(4) }) });
