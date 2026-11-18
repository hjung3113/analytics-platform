import { apiRequest } from '../../../lib/api/client';
import { fetchEntityLinksByTarget } from '../../../lib/api/entity-links';
import { apiPath, withRequestedId } from '../../../lib/api/path';
import { ApiError, ApiParseError } from '../../../lib/api/types';
import {
  type EntityLinkDto,
  type ListEntityLinksResponse,
  type VocDetailEnvelope,
  type VocSummaryEnvelope,
  vocDetailEnvelopeSchema,
  vocSummaryEnvelopeSchema,
} from '@ap/feature-shared';
import { useQueries, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const vocEvidenceSummarySchema = z.union([vocDetailEnvelopeSchema, vocSummaryEnvelopeSchema]);
type VocReadResult = VocDetailEnvelope | VocSummaryEnvelope;

const EVIDENCE_LINKS_STALE_TIME_MS = 30 * 1000;

export type LinkedEvidenceVocItem =
  | { kind: 'loading'; linkId: string }
  | { kind: 'restricted'; linkId: string }
  | { kind: 'readable'; linkId: string; vocId: string; displayId: string; title: string };

export interface FindingEvidenceVocsResult {
  status: 'loading' | 'error' | 'loaded';
  items: LinkedEvidenceVocItem[];
}

export function evidenceVocLinksFromEntityLinks(
  findingId: string,
  response: ListEntityLinksResponse,
): EntityLinkDto[] {
  return response.items.filter(
    (link) =>
      link.status === 'active' &&
      link.source_type === 'voc' &&
      link.target_type === 'finding' &&
      link.relation_type === 'evidence_of' &&
      (link.visibility_state !== 'allowed' || link.target_id === findingId),
  );
}

function shouldRetryDetailRead(failureCount: number, error: unknown): boolean {
  return (
    !(error instanceof ApiParseError) &&
    !(
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    ) &&
    failureCount < 1
  );
}

function hasFullVocTitle(voc: VocReadResult | undefined): voc is VocDetailEnvelope {
  return voc !== undefined && 'title' in voc && 'display_id' in voc;
}

export function useFindingEvidenceVocs(findingId: string): FindingEvidenceVocsResult {
  const linksQuery = useQuery({
    queryKey: ['entity-links', 'finding', findingId, 'evidence_of'] as const,
    queryFn: ({ signal }) => fetchEntityLinksByTarget('finding', findingId, { signal }),
    select: (response) => evidenceVocLinksFromEntityLinks(findingId, response),
    staleTime: EVIDENCE_LINKS_STALE_TIME_MS,
    retry: false,
  });

  const links = linksQuery.isSuccess ? (linksQuery.data ?? []) : [];
  const allowedVocIds = [
    ...new Set(
      links
        .filter(
          (link): link is Extract<EntityLinkDto, { visibility_state: 'allowed' }> =>
            link.visibility_state === 'allowed',
        )
        .map((link) => link.source_id),
    ),
  ];

  // vocEntityLinkProvider.getInternalSummary returns null and entityLinkTargetSummarySchema
  // has no 'voc' variant, so resolve readable VOC display_id + title via GET /vocs/:id.
  const vocQueries = useQueries({
    queries: allowedVocIds.map((vocId) => ({
      queryKey: ['voc', vocId] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const res = await apiRequest(
          'GET',
          apiPath`/vocs/${vocId}`,
          withRequestedId(vocEvidenceSummarySchema, vocId),
          { signal },
        );
        return res.data;
      },
      staleTime: EVIDENCE_LINKS_STALE_TIME_MS,
      retry: shouldRetryDetailRead,
    })),
  });

  if (linksQuery.isPending) {
    return { status: 'loading', items: [] };
  }

  if (linksQuery.isError) {
    return { status: 'error', items: [] };
  }

  const vocQueryById = new Map(allowedVocIds.map((vocId, index) => [vocId, vocQueries[index]]));
  const items: LinkedEvidenceVocItem[] = links.map((link) => {
    if (link.visibility_state !== 'allowed') {
      return { kind: 'restricted', linkId: link.id };
    }
    const vocQuery = vocQueryById.get(link.source_id);
    if (!vocQuery || vocQuery.isPending) {
      return { kind: 'loading', linkId: link.id };
    }
    if (!vocQuery.isError && vocQuery.isSuccess && hasFullVocTitle(vocQuery.data)) {
      return {
        kind: 'readable',
        linkId: link.id,
        vocId: link.source_id,
        displayId: vocQuery.data.display_id,
        title: vocQuery.data.title,
      };
    }
    return { kind: 'restricted', linkId: link.id };
  });

  return { status: 'loaded', items };
}
