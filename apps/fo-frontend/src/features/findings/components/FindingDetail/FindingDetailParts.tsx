// FindingDetailParts — the Finding detail as the parts a host frames itself (`DetailParts`).
// States: loading skeleton → not-found → permission-blocked → error → full detail.
// `FindingDetailPanel` frames the same parts; the platform bridge draws them in its own drawer.

import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import type { DetailParts } from '@/lib/host/detail-parts';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { useHostTitle } from '@/lib/host/host-seam';
import type { FindingDto } from '@fops/shared';
import { Button, EmptyState, PermissionBlockedPanel, SkeletonBlocks } from '@fops/ui';
import type * as React from 'react';
import { useFindingDetail } from '../../hooks/useFindingDetail';
import { FullFindingDetail } from './FullFindingDetail';

export type FindingDetailView =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'blocked' }
  | { kind: 'error' }
  | { kind: 'full'; finding: FindingDto };

/** Nothing in the Finding detail asks before closing, so there is no `requestClose` (not `ClosableDetailParts`). */
export type FindingDetailParts = DetailParts & { view: FindingDetailView };

export interface UseFindingDetailPartsArgs {
  findingId: string;
  /** What the not-found body's `Findings 목록으로` button does: the host decides where "back" is. */
  onClose: () => void;
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function FindingDetailSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6" aria-label="Finding 상세 불러오는 중">
      <SkeletonBlocks
        blocks={[
          { kind: 'title', size: 'large', width: 'half' },
          { kind: 'line', width: 'full' },
          { kind: 'line', width: 'three-quarters' },
        ]}
      />
      <div className="flex gap-2">
        <SkeletonBlocks
          blocks={[
            { kind: 'badge', width: 'standard' },
            { kind: 'badge', width: 'standard' },
          ]}
        />
      </div>
      <SkeletonBlocks
        blocks={[
          { kind: 'body', size: 'large', width: 'full' },
          { kind: 'line', width: 'third' },
        ]}
      />
    </div>
  );
}

// ── Not found ────────────────────────────────────────────────────────────────

function FindingNotFound({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <EmptyState
      title="Finding을 찾을 수 없습니다."
      body="해당 Finding은 삭제되었거나 접근 권한이 없습니다."
      action={
        <Button variant="outline" size="sm" onClick={onClose}>
          Findings 목록으로
        </Button>
      }
      padding="wide"
    />
  );
}

type FindingDetailErrorState = 'not-found' | 'blocked' | 'error';

function classifyFindingDetailError(error: unknown): FindingDetailErrorState {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'not_found.record') return 'not-found';
  if (code === 'permission.denied') return 'blocked';
  return 'error';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * The Finding detail as `DetailParts`. Needs a `HostSeamProvider` (links, notices, title) and the FeedbackOps providers.
 */
export function useFindingDetailParts({
  findingId,
  onClose,
}: UseFindingDetailPartsArgs): FindingDetailParts {
  const { data, isLoading, isError, isSuccess, isFetching, error } = useFindingDetail(findingId);
  useHostTitle(
    isSuccess && !isFetching && data?.id === findingId
      ? formatRecordDocumentTitle({ displayId: data.display_id, title: data.title })
      : null,
  );

  const frame = (view: FindingDetailView, body: React.ReactNode): FindingDetailParts => ({
    title: 'Finding',
    view,
    body,
  });

  // 1. Loading
  if (isLoading) {
    return frame(
      { kind: 'loading' },
      <div className="h-full overflow-y-auto">
        <FindingDetailSkeleton />
      </div>,
    );
  }

  // 2. Error
  if (isError) {
    const errorState = classifyFindingDetailError(error);
    if (errorState === 'not-found') {
      return frame({ kind: 'not-found' }, <FindingNotFound onClose={onClose} />);
    }
    // permission.denied → finding.read blocked
    if (errorState === 'blocked') {
      return frame(
        { kind: 'blocked' },
        <div className="flex h-full items-center justify-center p-6">
          <PermissionBlockedPanel
            state="denied"
            category="Finding 상세"
            reason={PERMISSION_BLOCKED_REASONS.findingDetail}
          />
        </div>,
      );
    }
    return frame(
      { kind: 'error' },
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm text-text-danger">데이터를 불러오지 못했습니다.</p>
      </div>,
    );
  }

  if (!data) return frame({ kind: 'not-found' }, <FindingNotFound onClose={onClose} />);

  // 3. Full detail. Independent of the document-title release above: a refetch must not blank the drawer's title.
  return {
    title:
      formatRecordDocumentTitle({ displayId: data.display_id, title: data.title }) ??
      data.display_id,
    view: { kind: 'full', finding: data },
    body: <FullFindingDetail key={data.id} finding={data} />,
  };
}
