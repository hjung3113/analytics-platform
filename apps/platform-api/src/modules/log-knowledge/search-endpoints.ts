// The knowledge search reads (#1507 S-d, design log-knowledge-search §4): `logKnowledge.search` and `logKnowledge.searchSuggest`. Same read
// right as every knowledge read (`platform:view`; a token call needs `workspace.read` in its scopes, so a service Actor reads only with an
// explicit grant). The request is judged by the `@ap/contract-schemas` schema; the pipeline is `repositories/search-read.ts`. A hidden and a
// nonexistent Item are indistinguishable: the visibility predicate sits inside the candidate statement, so there is nothing to tell apart.
// The query text is never logged or audited (design §8).

import {
  KNOWLEDGE_SEARCH_LIMIT_DEFAULT,
  knowledgeSearchRequestSchema,
  knowledgeSearchSuggestRequestSchema,
} from '@ap/contract-schemas';
import type { z } from 'zod/v4';

import { unsafeText } from '../../lib/text-safety.js';
import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_SEARCH_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import type { Viewer } from './repositories/access-visibility.js';
import { runSearch, runSuggest, type SearchInput } from './repositories/search-read.js';

type OwnerFilter = z.infer<typeof knowledgeSearchRequestSchema>['ownerFilter'];

const spec = (id: string, paramKeys: readonly string[]) =>
  ({ id, menuId: LOG_KNOWLEDGE_SEARCH_MENU_ID, paramKeys, permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false }) as const;

export const SEARCH_PARAM_KEYS = ['q', 'ownerFilter', 'relation', 'kind', 'includeOpposite', 'cursor', 'limit'] as const;
export const SUGGEST_PARAM_KEYS = ['q', 'ownerFilter'] as const;

/** A refusal message that names the field and rule, never the submitted value. */
function refusal(error: z.ZodError): string {
  const issue = error.issues[0];
  return `${issue?.path.join('.') || 'params'}: ${issue?.message ?? 'invalid'}`;
}

const ownerOf = (filter: OwnerFilter): SearchInput['owner'] =>
  filter && (filter.modelId || filter.softwareId)
    ? { modelId: filter.modelId ?? null, softwareId: filter.softwareId ?? null, includeSoftware: filter.includeSoftware === true }
    : null;

/** Judges the search params; the parsed request is also what `handle` runs. */
export function parseSearchParams(params: Record<string, unknown>): { ok: true; input: SearchInput } | { ok: false; message: string } {
  const parsed = knowledgeSearchRequestSchema.safeParse(params);
  if (!parsed.success) return { ok: false, message: refusal(parsed.error) };
  const r = parsed.data;
  if (r.q != null && unsafeText(r.q)) return { ok: false, message: 'q: contains characters the database cannot hold' };
  return {
    ok: true,
    input: {
      q: r.q ?? null,
      owner: ownerOf(r.ownerFilter),
      relation: r.relation ?? null,
      kind: r.kind ?? 'all',
      includeOpposite: r.includeOpposite === true,
      cursor: r.cursor ?? null,
      limit: r.limit ?? KNOWLEDGE_SEARCH_LIMIT_DEFAULT,
    },
  };
}

export function parseSuggestParams(params: Record<string, unknown>): { ok: true; q: string; owner: SearchInput['owner'] } | { ok: false; message: string } {
  const parsed = knowledgeSearchSuggestRequestSchema.safeParse(params);
  if (!parsed.success) return { ok: false, message: refusal(parsed.error) };
  if (unsafeText(parsed.data.q) || parsed.data.q.trim() === '') return { ok: false, message: 'q: must be non-blank text the database can hold' };
  return { ok: true, q: parsed.data.q, owner: ownerOf(parsed.data.ownerFilter) };
}

export function searchEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  const authorize: MenuEndpointDeclaration['authorize'] = (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {});
  const viewerOf = (actor: { workspace_id: string; actor_id: string }): Viewer => ({ workspaceId: actor.workspace_id, actorId: actor.actor_id });
  return [
    {
      spec: spec('logKnowledge.search', SEARCH_PARAM_KEYS),
      authorize,
      validate(params): ParamsJudgment {
        const judged = parseSearchParams(params);
        return judged.ok ? { ok: true } : judged;
      },
      async handle(args): Promise<EndpointResult> {
        const judged = parseSearchParams(args.params);
        if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
        const outcome = await runSearch(deps.db, viewerOf(args.actor), judged.input);
        return outcome.ok ? { outcome: 'ok', data: outcome.response } : { outcome: 'error', data: null, message: outcome.message };
      },
    },
    {
      spec: spec('logKnowledge.searchSuggest', SUGGEST_PARAM_KEYS),
      authorize,
      validate(params): ParamsJudgment {
        const judged = parseSuggestParams(params);
        return judged.ok ? { ok: true } : judged;
      },
      async handle(args): Promise<EndpointResult> {
        const judged = parseSuggestParams(args.params);
        if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
        return { outcome: 'ok', data: await runSuggest(deps.db, viewerOf(args.actor), judged.q, judged.owner) };
      },
    },
  ];
}
