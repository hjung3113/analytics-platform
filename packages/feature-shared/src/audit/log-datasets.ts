// Log test dataset audit detail schemas (#1477 D-a, design docs/design/features/log-test-datasets/README.md §3). Non-sensitive and
// body-free: ids, tag and status names, counts and the manifest digest — never a file location (`fileRef`), a hash list, a sample file
// content, or the text of a note, purpose or reason (only its length). Those live in `log_datasets.*` (read through their endpoints).
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_DATASETS_AUDIT_EVENT_TYPES = [
  'dataset.created',
  'dataset.updated',
  'dataset.archived',
  'dataset.revision_created',
  'dataset.candidate_created',
  'dataset.candidate_approved',
  'dataset.candidate_rejected',
  'dataset.baseline_created',
  'dataset.baseline_updated',
  'dataset.baseline_approved',
  'dataset.baseline_superseded',
] as const;

/** Subject id: the dataset id (`dataset.*`), the revision id (`dataset.revision_created`), the candidate id (`dataset.candidate_*`), the baseline id (`dataset.baseline_*`). */
export const LOG_DATASETS_SUBJECT_TYPES = ['dataset', 'dataset_revision', 'dataset_candidate', 'dataset_baseline'] as const;

const SCENARIO_TAG = z.enum(['normal', 'exception', 'boundary', 'regression', 'file_boundary', 'carryover', 'partial_support']);
const SHARE_SCOPE = z.enum(['private', 'workspace']);
const AVAILABILITY = z.enum(['available', 'unavailable', 'hash_mismatch', 'unverified']);
const COUNT = z.number().int().min(0);
const FILE_COUNT = z.number().int().min(1);

export const datasetCreatedDetailSchema = z
  .object({
    shareScope: SHARE_SCOPE,
    scenarioTags: z.array(SCENARIO_TAG),
    modelCount: COUNT,
    synthetic: z.boolean(),
  })
  .strict();

export const datasetUpdatedDetailSchema = z
  .object({
    /** Names of the fields the call changed (`name`, `purpose`, `shareScope`, `modelIds`, `scenarioTags`). */
    changed: z.array(z.string()).min(1),
  })
  .strict();

export const datasetArchivedDetailSchema = z.object({ revisionCount: COUNT }).strict();

export const datasetRevisionCreatedDetailSchema = z
  .object({
    datasetId: z.string().uuid(),
    seq: z.number().int().min(1),
    fileCount: FILE_COUNT,
    digest: z.string().regex(/^[0-9a-f]{64}$/),
    availability: AVAILABILITY,
  })
  .strict();

export const datasetCandidateCreatedDetailSchema = z
  .object({
    origin: z.enum(['manual', 'round_evidence']),
    fileCount: FILE_COUNT,
    evidenceCount: COUNT,
  })
  .strict();

export const datasetCandidateApprovedDetailSchema = z
  .object({ datasetId: z.string().uuid(), revisionId: z.string().uuid(), fileCount: FILE_COUNT })
  .strict();

export const datasetCandidateRejectedDetailSchema = z.object({ reasonLength: z.number().int().min(1) }).strict();

// Baselines (#1478 D-b): ids, counts and status names only. Never an expectation body, an exception reason, an evidence location, a
// golden reference or the text of a reason (its length). `selfApproved` is the log-lifecycle D3 marker: the approver is the author.
const BASELINE_STATUS = z.enum(['draft', 'approved', 'superseded']);

export const datasetBaselineCreatedDetailSchema = z
  .object({
    datasetId: z.string().uuid(),
    revisionId: z.string().uuid(),
    seq: z.number().int().min(1),
    expectationCount: COUNT,
    /** Set when the draft was copied from an attempt's results (not implemented until a lifecycle read port exists). */
    copied: z.boolean(),
  })
  .strict();

export const datasetBaselineUpdatedDetailSchema = z
  .object({
    /** Names of the fields the call changed (`profilePin`, `expectedScope`, `expectations`, `parserGoldenRef`). */
    changed: z.array(z.string()).min(1),
    expectationCount: COUNT,
  })
  .strict();

export const datasetBaselineApprovedDetailSchema = z
  .object({
    datasetId: z.string().uuid(),
    revisionId: z.string().uuid(),
    seq: z.number().int().min(1),
    expectationCount: COUNT,
    /** The seq this approval superseded, when one was approved before. */
    supersededSeq: z.number().int().min(1).nullable(),
    reasonLength: z.number().int().min(1),
    selfApproved: z.boolean(),
  })
  .strict();

export const datasetBaselineSupersededDetailSchema = z
  .object({
    datasetId: z.string().uuid(),
    revisionId: z.string().uuid(),
    seq: z.number().int().min(1),
    /** The baseline whose approval superseded this one. */
    bySeq: z.number().int().min(1),
    from: BASELINE_STATUS,
  })
  .strict();

export const LOG_DATASETS_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'dataset.created': datasetCreatedDetailSchema,
  'dataset.updated': datasetUpdatedDetailSchema,
  'dataset.archived': datasetArchivedDetailSchema,
  'dataset.revision_created': datasetRevisionCreatedDetailSchema,
  'dataset.candidate_created': datasetCandidateCreatedDetailSchema,
  'dataset.candidate_approved': datasetCandidateApprovedDetailSchema,
  'dataset.candidate_rejected': datasetCandidateRejectedDetailSchema,
  'dataset.baseline_created': datasetBaselineCreatedDetailSchema,
  'dataset.baseline_updated': datasetBaselineUpdatedDetailSchema,
  'dataset.baseline_approved': datasetBaselineApprovedDetailSchema,
  'dataset.baseline_superseded': datasetBaselineSupersededDetailSchema,
} as const;
