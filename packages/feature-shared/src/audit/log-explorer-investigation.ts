// Log explorer audit detail schemas (#1468 b, design docs/design/features/log-explorer/README.md §3.2, ADR-0020 spirit).
// Non-sensitive and body-free: ids, the origin, the NAMES of the filter keys that were set, counts, the length of a note —
// never a filter value, a file location, a hash or a note's text, which live in `log_explorer.investigation` (read
// through its endpoints). Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_EXPLORER_INVESTIGATION_AUDIT_EVENT_TYPES = [
  'explorer.investigation.created',
  'explorer.investigation.updated',
  'explorer.investigation.archived',
  'explorer.evidence.added',
  'explorer.evidence.removed',
] as const;

/** Subject id of the explorer events is the investigation id. */
export const LOG_EXPLORER_INVESTIGATION_SUBJECT_TYPES = ['investigation'] as const;

const ORIGIN = z.enum(['standalone', 'round']);
/** A filter key is a name, never a value: a short identifier-like string. */
const FILTER_KEY = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/);

export const explorerInvestigationCreatedDetailSchema = z
  .object({
    origin: ORIGIN,
    roundId: z.string().uuid().nullable(),
    fileCount: z.number().int().min(0),
    filterKeys: z.array(FILTER_KEY).max(50),
  })
  .strict();

export const explorerInvestigationUpdatedDetailSchema = z
  .object({
    /** Which fields the call changed; `filterKeys` is the key set after the change when filters changed. */
    changed: z.array(z.enum(['title', 'filters'])).min(1),
    filterKeys: z.array(FILTER_KEY).max(50),
  })
  .strict();

export const explorerInvestigationArchivedDetailSchema = z.object({ evidenceCount: z.number().int().min(0) }).strict();

export const explorerEvidenceAddedDetailSchema = z
  .object({ evidenceCount: z.number().int().min(1).max(100), noteLength: z.number().int().min(0) })
  .strict();

export const explorerEvidenceRemovedDetailSchema = z.object({ evidenceCount: z.number().int().min(0).max(99) }).strict();

export const LOG_EXPLORER_INVESTIGATION_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'explorer.investigation.created': explorerInvestigationCreatedDetailSchema,
  'explorer.investigation.updated': explorerInvestigationUpdatedDetailSchema,
  'explorer.investigation.archived': explorerInvestigationArchivedDetailSchema,
  'explorer.evidence.added': explorerEvidenceAddedDetailSchema,
  'explorer.evidence.removed': explorerEvidenceRemovedDetailSchema,
} as const satisfies Record<(typeof LOG_EXPLORER_INVESTIGATION_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
