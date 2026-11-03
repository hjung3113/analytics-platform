// VocReadingPane — the right side of 소통 › VOC and its full page (ADR-0110). Which detail to mount is decided by the
// server: the public projection of the VOC is read first, and only its own `mine: true` answer mounts the reporter
// detail (conversation and reply input). A VOC that is not the actor's own is drawn from that projection alone, so no
// reporter or operator route is requested for it. While the answer is pending, or when it is a denial, the reporter detail is never mounted.

import { ApiError } from '@/lib/api/types';
import { SkeletonBlocks, EmptyState } from '@ap/ui';
import { useQuery } from '@tanstack/react-query';
import type * as React from 'react';
import { ReporterVocDetail } from '../reporter/ReporterVocDetail';
import { PublicVocDetail } from './PublicVocDetail';
import { fetchPublicVoc } from './public-voc-api';

export interface VocReadingPaneProps {
  vocId: string;
  variant?: 'page' | 'embedded';
}

export function VocReadingPane({ vocId, variant = 'page' }: VocReadingPaneProps): React.ReactElement {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['voc-public', vocId] as const,
    queryFn: ({ signal }) => fetchPublicVoc(vocId, signal),
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
  });
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4" aria-label="VOC 상세 불러오는 중">
        <SkeletonBlocks blocks={[
          { kind: 'title', size: 'small', width: 'third' },
          { kind: 'line', width: 'full' },
          { kind: 'body', size: 'compact', width: 'full' },
          { kind: 'body', size: 'large', width: 'full' },
        ]} />
      </div>
    );
  }
  if (isError || data === undefined) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return <EmptyState title="VOC를 찾을 수 없습니다" body="해당 VOC는 삭제되었거나 접근 권한이 없습니다." />;
    }
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm text-text-danger">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }
  return data.mine ? <ReporterVocDetail vocId={vocId} variant={variant} /> : <PublicVocDetail voc={data} variant={variant} />;
}
