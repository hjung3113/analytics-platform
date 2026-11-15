// Log knowledge catalog audit detail schemas (#1194 a, ADR-0107). Non-sensitive: code and name of a
// catalog row plus, on update, `changes` as `{ field: [before, after] }` (a model's process mapping
// changes as id lists). Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_KNOWLEDGE_CATALOG_AUDIT_EVENT_TYPES = [
  'knowledge.catalog.created',
  'knowledge.catalog.updated',
  'knowledge.catalog.deactivated',
  'knowledge.catalog.reactivated',
  'knowledge.catalog.identity_mapped',
  'knowledge.model_topview.linked',
  'knowledge.model_topview.unlinked',
] as const;

export const LOG_KNOWLEDGE_CATALOG_SUBJECT_TYPES = [
  'knowledge_vendor',
  'knowledge_process',
  'knowledge_model',
  'knowledge_software',
] as const;

const changesSchema = z.record(z.string(), z.tuple([z.unknown(), z.unknown()]));

// Set when the write came from a catalog import (#1195 b): the job and the file row that caused it.
const importSourceSchema = z.object({ importJobId: z.string(), rowNo: z.number().int() }).strict();

export const logKnowledgeCatalogDetailSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    changes: changesSchema.optional(),
    source: importSourceSchema.optional(),
  })
  .strict();
export type LogKnowledgeCatalogDetail = z.infer<typeof logKnowledgeCatalogDetailSchema>;

/** An import row was accepted as an alias of an existing catalog row (`external_identity_map`). */
export const logKnowledgeIdentityMappedDetailSchema = z
  .object({
    sourceSystem: z.string(),
    sourceType: z.string(),
    externalKey: z.string(),
    source: importSourceSchema.optional(),
  })
  .strict();

/** A model's Top View pointer was set or removed (#1656): ids and the Revision hash, never the document. */
export const logKnowledgeModelTopViewDetailSchema = z
  .object({
    linkId: z.string(),
    fromSoftwareId: z.string().nullable(),
    layoutId: z.string(),
    revision: z.string(),
  })
  .strict();

export const LOG_KNOWLEDGE_CATALOG_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'knowledge.catalog.created': logKnowledgeCatalogDetailSchema,
  'knowledge.catalog.updated': logKnowledgeCatalogDetailSchema,
  'knowledge.catalog.deactivated': logKnowledgeCatalogDetailSchema,
  'knowledge.catalog.reactivated': logKnowledgeCatalogDetailSchema,
  'knowledge.catalog.identity_mapped': logKnowledgeIdentityMappedDetailSchema,
  'knowledge.model_topview.linked': logKnowledgeModelTopViewDetailSchema,
  'knowledge.model_topview.unlinked': logKnowledgeModelTopViewDetailSchema,
} as const satisfies Record<(typeof LOG_KNOWLEDGE_CATALOG_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
