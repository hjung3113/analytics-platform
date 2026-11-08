// The SearchPort (#1507 S-d, design log-knowledge-search §4, §5.3): CANDIDATE GENERATION only. A plan goes in, ranked candidates come out
// (item id, strongest stage, score, match reasons). The port knows nothing about access: the caller hands in an opaque `guard` that the
// adapter must apply to the Item id inside the very statement that produces candidates, so a hidden Item can neither be a candidate, nor
// be counted, nor be suggested (ADR-0124). Display values (title, excerpt, state) are NOT the port's business: they are read live
// afterwards (§4 step 4). Any adapter must pass `search-port-contract.ts`.

import type { SQL } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';

export type RelationRecordKind = 'observed' | 'expected';
export type SearchReason = 'observed_same_direction' | 'expected_same_direction' | 'exact_token' | 'concept_mapping' | 'approved_alias' | 'text';

/** Stage of a reason, 1 (strongest) to 6 (design §4.2). */
export const REASON_STAGE: Readonly<Record<SearchReason, number>> = {
  observed_same_direction: 1,
  expected_same_direction: 2,
  exact_token: 3,
  concept_mapping: 4,
  approved_alias: 5,
  text: 6,
};
export const REASON_ORDER = Object.keys(REASON_STAGE) as SearchReason[];

/** A complete lower-case key reached through a confirmed equivalent mapping, bound to its Model. */
export interface ConceptKey {
  modelId: string;
  key: string;
}

/** One side of a direction: lower-case Event tokens (a whole key or its Event part) and Model/key pairs reached through confirmed equivalent concept mappings. */
export interface KeyMatcher {
  tokens: string[];
  conceptKeys: ConceptKey[];
}

export interface SearchPlan {
  workspaceId: string;
  owner: { modelId: string | null; softwareId: string | null; includeSoftware: boolean } | null;
  /** Plain text stages; null or no words = no text stage. */
  text: { normalized: string; words: string[]; conceptKeys: ConceptKey[] } | null;
  /** Direction stages; `source` happens before `target`. Null = no direction. */
  direction: { source: KeyMatcher; target: KeyMatcher; kinds: RelationRecordKind[] } | null;
}

export interface Candidate {
  itemId: string;
  stage: number;
  /** Rank input inside a stage, higher first (micro units, integer so the cursor round-trips exactly). */
  scoreMicro: number;
  /** Publication time of the latest Revision, epoch microseconds. */
  publishedAtMicro: number;
  reasons: SearchReason[];
  /** The best stage rests on `expected` records only. */
  expectedOnly: boolean;
}

/** Position after the last row of the previous page: the sort key tuple `(stage, score desc, published desc, item id)`. */
export interface SearchAfter {
  stage: number;
  scoreMicro: number;
  publishedAtMicro: number;
  itemId: string;
}

/** The visibility predicate over an Item id expression; opaque to the adapter. */
export type CandidateGuard = (itemId: SQL) => SQL;

export interface Suggestion {
  kind: 'title' | 'eventKey';
  text: string;
}

export interface SearchPort {
  /** Main section candidates in rank order after `after`, at most `limit`. Same-direction and text stages only: the opposite direction is never in here. */
  search(tx: Tx, plan: SearchPlan, guard: CandidateGuard, page: { after: SearchAfter | null; limit: number }): Promise<Candidate[]>;
  /** Candidates of the opposite direction (items with no same-direction record), at most `limit`; empty when the plan has no direction. */
  searchOpposite(tx: Tx, plan: SearchPlan, guard: CandidateGuard, limit: number): Promise<Candidate[]>;
  /** How many main candidates exist, counted up to `cap` (never more). */
  countUpTo(tx: Tx, plan: SearchPlan, guard: CandidateGuard, cap: number): Promise<number>;
  /** Prefix suggestions (Item titles, Event keys of Items) through the same guard, at most `limit`. */
  suggest(tx: Tx, plan: Pick<SearchPlan, 'workspaceId' | 'owner'>, guard: CandidateGuard, prefix: string, limit: number): Promise<Suggestion[]>;
}
