import { z } from 'zod/v4';

// Log knowledge search wire contract, `v0` (provisional; #1507 S-d, design log-knowledge-search §4, ADR-0124, ADR-0125). Request and response of the
// menu reads `logKnowledge.search` and `logKnowledge.searchSuggest`. Strict objects: a forged extra field is refused.
//
// Rules JSON Schema cannot hold (the server owns them): the closed operator words of the query text, one relation condition per request, a
// cursor that belongs to the query that produced it, and every visibility rule. By design the response has NO exact total: `capped` only says
// «more than 100 visible matches», so a count of hidden items cannot be derived (ADR-0124). A hidden and a nonexistent Item are
// indistinguishable in every field.

export const KNOWLEDGE_SEARCH_VERSION = 'v0';
export const KNOWLEDGE_SEARCH_Q_MAX = 200;
export const KNOWLEDGE_SEARCH_LIMIT_MAX = 50;
export const KNOWLEDGE_SEARCH_LIMIT_DEFAULT = 20;
export const KNOWLEDGE_SEARCH_CURSOR_MAX = 512;
export const KNOWLEDGE_SEARCH_EVENT_KEY_MAX = 1200;
/** Visible matches are counted up to this value plus one; the response carries `capped`, never the number. */
export const KNOWLEDGE_SEARCH_CAP = 100;
export const KNOWLEDGE_SUGGEST_LIMIT_MAX = 12;
export const KNOWLEDGE_SEARCH_OPPOSITE_LIMIT = 20;

export const KNOWLEDGE_SEARCH_RELATION_KINDS = ['observed', 'expected', 'all'] as const;
export const KNOWLEDGE_SEARCH_PREDICATES = ['before', 'after'] as const;
/** Why an Item is a result, strongest first (design §4.2 stages 1-6). */
export const KNOWLEDGE_SEARCH_REASONS = [
  'observed_same_direction',
  'expected_same_direction',
  'exact_token',
  'concept_mapping',
  'approved_alias',
  'text',
] as const;
export const KNOWLEDGE_SEARCH_SUGGESTION_KINDS = ['title', 'eventKey'] as const;

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const eventKey = z.string().min(1).max(KNOWLEDGE_SEARCH_EVENT_KEY_MAX).refine((v) => v.trim() === v && v !== '', { message: 'must be a trimmed non-blank key' });

export const knowledgeSearchOwnerFilterSchema = z.strictObject({
  modelId: uuid.nullable().optional(),
  softwareId: uuid.nullable().optional(),
  /** With `modelId`: also the Items of that model's SW versions. Default false. */
  includeSoftware: z.boolean().optional(),
});

/** The explicit relation condition: `source` happens `before` or `after` `target`. `after` is stored and searched as the swapped `before`. */
export const knowledgeSearchRelationSchema = z.strictObject({
  source: eventKey,
  predicate: z.enum(KNOWLEDGE_SEARCH_PREDICATES),
  target: eventKey,
});

export const knowledgeSearchRequestSchema = z.strictObject({
  q: z.string().max(KNOWLEDGE_SEARCH_Q_MAX).nullable().optional(),
  ownerFilter: knowledgeSearchOwnerFilterSchema.nullable().optional(),
  relation: knowledgeSearchRelationSchema.nullable().optional(),
  /** Which relation records count for a direction (explicit or from the query). Default `all`. */
  kind: z.enum(KNOWLEDGE_SEARCH_RELATION_KINDS).nullable().optional(),
  /** Also return the opposite direction as a separate section (first page only). Default false. */
  includeOpposite: z.boolean().optional(),
  cursor: z.string().min(1).max(KNOWLEDGE_SEARCH_CURSOR_MAX).nullable().optional(),
  limit: z.number().int().min(1).max(KNOWLEDGE_SEARCH_LIMIT_MAX).optional(),
});

export const knowledgeSearchSuggestRequestSchema = z.strictObject({
  q: z.string().min(1).max(KNOWLEDGE_SEARCH_Q_MAX),
  ownerFilter: knowledgeSearchOwnerFilterSchema.nullable().optional(),
});

/** What the server understood of the query; the screen shows it as a chip that can be switched off by sending `relation: null` with a plain `q`. */
export const knowledgeSearchInterpretationSchema = z.strictObject({
  original: z.string(),
  tokens: z.array(z.string()),
  direction: z
    .strictObject({
      /** `explicit` = the `relation` param; `operator` = a closed operator word between two Event tokens in `q`. */
      origin: z.enum(['explicit', 'operator']),
      /** Normalized: `before` only; `B after A` is reported as source A, target B. */
      source: z.string(),
      target: z.string(),
      kind: z.enum(KNOWLEDGE_SEARCH_RELATION_KINDS),
      /** The input said `after`, so source and target were swapped. */
      swapped: z.boolean(),
    })
    .nullable(),
});

export const knowledgeSearchOwnerSchema = z.strictObject({
  modelId: uuid,
  modelCode: z.string(),
  modelName: z.string(),
  softwareId: uuid.nullable(),
  softwareLabel: z.string().nullable(),
});

export const knowledgeSearchItemSchema = z.strictObject({
  itemId: uuid,
  itemNo: z.number().int(),
  title: z.string(),
  /** Built from the latest Revision at read time; the index stores none. */
  excerpt: z.string(),
  typeCode: z.string(),
  revisionNo: z.number().int(),
  publicationState: z.string(),
  verificationState: z.string(),
  processingState: z.string(),
  publishedAt: z.string(),
  owner: knowledgeSearchOwnerSchema,
  reasons: z.array(z.enum(KNOWLEDGE_SEARCH_REASONS)),
  /** The strongest reason's stage, 1-6. */
  stage: z.number().int().min(1).max(6),
  /** The direction matched only through `expected` records: shown as «명세상 기대». */
  expectedOnly: z.boolean(),
  /** «관련 Item n건»: only Items the viewer may see are counted. */
  relatedCount: z.number().int().min(0),
});

export const knowledgeSearchResponseSchema = z.strictObject({
  version: z.literal(KNOWLEDGE_SEARCH_VERSION),
  interpretation: knowledgeSearchInterpretationSchema,
  items: z.array(knowledgeSearchItemSchema),
  /** Opposite-direction Items; present (maybe empty) only when `includeOpposite` was asked for on the first page. */
  opposite: z.array(knowledgeSearchItemSchema).nullable(),
  oppositeHasMore: z.boolean(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
  /** More than `KNOWLEDGE_SEARCH_CAP` visible matches: «100건 이상». There is deliberately no total. */
  capped: z.boolean(),
  indexLag: z.strictObject({
    /** Age in seconds of the oldest change the index has not taken in yet; null when none waits. */
    lagSeconds: z.number().int().nullable(),
    /** The first index build; `percent` is whole numbers, never an item count. */
    backfill: z.strictObject({ state: z.enum(['running', 'done', 'none']), percent: z.number().int().min(0).max(100) }),
  }),
});

export const knowledgeSearchSuggestionSchema = z.strictObject({
  kind: z.enum(KNOWLEDGE_SEARCH_SUGGESTION_KINDS),
  text: z.string(),
});

export const knowledgeSearchSuggestResponseSchema = z.strictObject({
  version: z.literal(KNOWLEDGE_SEARCH_VERSION),
  suggestions: z.array(knowledgeSearchSuggestionSchema).max(KNOWLEDGE_SUGGEST_LIMIT_MAX),
});
