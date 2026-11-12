// SourceReadPort (design log-explorer §3.1, ADR-0119). The platform server asks a Source owner's adapter for text and never stores the
// answer. Wire shapes are the `v0` (provisional) schemas of @ap/contract-schemas; this file adds the call context and the port interface.
//
// Every call takes an AbortSignal and a time budget. A cancelled call rejects with SourceReadError('aborted'); a call that runs out of
// budget rejects with 'time_budget_exceeded' (a search may instead answer `ok` with `partial: true`). Any other failure rejects with
// 'adapter_failed'. Permission denied, an absent source and an unsupported capability are answered states, not errors.

import type {
  SourceSampleSet,
  SourceDescribeRequest,
  SourceDescribeResponse,
  SourceParsedRequest,
  SourceParsedResponse,
  SourcePeriodsRequest,
  SourcePeriodsResponse,
  SourceSearchRequest,
  SourceSearchResponse,
  SourceTopViewRequest,
  SourceTopViewResponse,
  SourceWindowRequest,
  SourceWindowResponse,
} from '@ap/contract-schemas';

export interface SourceReadContext {
  /** Cancels the call. Required: a call without a way to stop it is not allowed. */
  signal: AbortSignal;
  /** Server-resolved Round manifest only. Never supplied from client sampleSet/sha fields. */
  trustedSampleSet?: SourceSampleSet;
  /** Wall-clock budget of this call in ms. The server never passes more than SOURCE_READ_TIME_BUDGET_MS. */
  timeBudgetMs: number;
}

export interface SourceReadPort {
  describe(request: SourceDescribeRequest, ctx: SourceReadContext): Promise<SourceDescribeResponse>;
  searchRecords(request: SourceSearchRequest, ctx: SourceReadContext): Promise<SourceSearchResponse>;
  getWindow(request: SourceWindowRequest, ctx: SourceReadContext): Promise<SourceWindowResponse>;
  getParsed(request: SourceParsedRequest, ctx: SourceReadContext): Promise<SourceParsedResponse>;
  getPeriods(request: SourcePeriodsRequest, ctx: SourceReadContext): Promise<SourcePeriodsResponse>;
  getTopViewLink(request: SourceTopViewRequest, ctx: SourceReadContext): Promise<SourceTopViewResponse>;
}
