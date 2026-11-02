// Log knowledge catalog audit detail schemas (#1194 a, ADR-0107). Non-sensitive: code and name of a
// catalog row plus, on update, `changes` as `{ field: [before, after] }` (a model's process mapping
// changes as id lists). Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_KNOWLEDGE_CATALOG_AUDIT_EVENT_TYPES = [
  'knowledge.catalog.created',
  'knowledge.catalog.updated',
  'knowledge.catalog.deactivated',
  'knowledge.catalog.reactivated',
] as const;

export const LOG_KNOWLEDGE_CATALOG_SUBJECT_TYPES = [
  'knowledge_vendor',
  'knowledge_process',
  'knowledge_model',
  'knowledge_software',
] as const;

const changesSchema = z.record(z.string(), z.tuple([z.unknown(), z.unknown()]));

export const logKnowledgeCatalogDetailSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    changes: changesSchema.optional(),
  })
  .strict();
export type LogKnowledgeCatalogDetail = z.infer<typeof logKnowledgeCatalogDetailSchema>;

export const LOG_KNOWLEDGE_CATALOG_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'knowledge.catalog.created': logKnowledgeCatalogDetailSchema,
  'knowledge.catalog.updated': logKnowledgeCatalogDetailSchema,
  'knowledge.catalog.deactivated': logKnowledgeCatalogDetailSchema,
  'knowledge.catalog.reactivated': logKnowledgeCatalogDetailSchema,
} as const satisfies Record<(typeof LOG_KNOWLEDGE_CATALOG_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
