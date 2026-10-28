// ReporterVocDetail — one VOC as its reporter sees it, for the platform 내 VOC page (platform ADR-0071).
//
// The backend sends a reporter who also holds an operator capability the operator envelope (severity,
// owner, triage state, internal comments), and VocDetailPanel draws Triage, Finding and composers by
// role. This screen draws a fixed allowlist whatever the envelope holds, and nothing that writes.

import { ATTACHMENT_FALLBACK_LABEL } from '@/lib/copy/attachments';
import { useSignedInActor } from '@/lib/cross-system/useSignedInActor';
import { useVocDetail } from '@/lib/cross-system/useVocDetail';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatDateTime } from '@/lib/format/datetime';
import {
  EmptyState,
  PanelSectionTitle,
  PanelTitleBlock,
  RichContentRenderer,
  SkeletonBlocks,
  type TipTapDoc,
} from '@ap/ui';
import { isTipTapDocStructurallyEmpty } from '@fops/shared';
import { ReporterStatusBadge } from '@fops/ui';
import * as React from 'react';
import { AttachmentChipList } from '../detail/AttachmentChip';
import { ConversationTimeline } from '../detail/ConversationTimeline';
import { LinkedEntityTrailSection } from '../detail/LinkedEntityTrailSection';
import { LinkedExecutionSection } from '../detail/LinkedExecutionSection';

export interface ReporterVocDetailProps {
  vocId: string;
  /** `embedded` leaves the outer padding to the host's detail slot; `page` is the full-page frame. */
  variant?: 'page' | 'embedded';
}

function NotFound(): React.ReactElement {
  return (
    <EmptyState
      title="VOC를 찾을 수 없습니다"
      body="해당 VOC는 삭제되었거나 접근 권한이 없습니다."
    />
  );
}

export function ReporterVocDetail({
  vocId,
  variant = 'page',
}: ReporterVocDetailProps): React.ReactElement {
  const { data, isLoading, isError, error } = useVocDetail(vocId);
  const me = useSignedInActor();
  const { actors } = useWorkspaceActors();
  const actorNamesById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );

  if (isLoading || (me.isLoading && !isError)) {
    return (
      <div className="flex flex-col gap-4 p-4" aria-label="VOC 상세 불러오는 중">
        <SkeletonBlocks
          blocks={[
            { kind: 'title', size: 'small', width: 'third' },
            { kind: 'line', width: 'full' },
            { kind: 'body', size: 'compact', width: 'full' },
            { kind: 'body', size: 'large', width: 'full' },
          ]}
        />
      </div>
    );
  }
  if (isError || me.isError) {
    if (isError && (error as { code?: string } | null)?.code === 'not_found.record')
      return <NotFound />;
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-sm text-text-danger">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }
  // A summary envelope (no title) is a VOC the actor may not read: say nothing more than "not found".
  if (data === undefined || !('title' in data)) return <NotFound />;
  // 내 VOC shows the signed-in user's own VOCs only. An operator may read any VOC (the server allows it), but not here:
  // a foreign VOC is "not found", with nothing of it drawn.
  if (me.data === undefined || data.reporter_id !== me.data.id) return <NotFound />;

  const voc = data;
  const embedded = variant === 'embedded';
  return (
    <div
      className={embedded ? 'flex flex-col' : 'flex flex-col px-6 pt-7 pb-16'}
      data-testid="reporter-voc-detail"
    >
      <div className={embedded ? 'mb-4' : 'mb-4 pt-2'}>
        <PanelTitleBlock title={voc.title} inset="none" className="mb-1" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">{voc.display_id}</span>
          <ReporterStatusBadge status={voc.reporter_facing_status} />
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <div className="flex gap-1">
            <dt>접수</dt>
            <dd>{formatDateTime(voc.created_at)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>최근 변경</dt>
            <dd>{formatDateTime(voc.updated_at)}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-4">
        <PanelSectionTitle>본문</PanelSectionTitle>
        <div className="rounded-md bg-surface-card-elevated p-4 text-sm text-text-secondary leading-relaxed">
          {isTipTapDocStructurallyEmpty(voc.description_rich_content) ? (
            <p className="text-text-muted">설명 없음</p>
          ) : (
            <RichContentRenderer
              doc={voc.description_rich_content as TipTapDoc}
              mode="reporter_visible"
              surface="voc-description"
              attachments={voc.attachments}
              attachmentFallbackLabel={ATTACHMENT_FALLBACK_LABEL}
            />
          )}
        </div>
        <AttachmentChipList attachments={voc.attachments} />
      </div>
      <div className="mt-8">
        <ConversationTimeline
          voc={voc}
          canTriage={false}
          actorNamesById={actorNamesById}
          meActor={me.data}
        />
      </div>
      <LinkedExecutionSection voc={voc} isReporterContext />
      <LinkedEntityTrailSection
        links={voc.links ?? []}
        trails={voc.linked_execution.trails}
        isReporterContext
      />
    </div>
  );
}
