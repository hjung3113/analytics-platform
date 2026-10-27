// TimelineEntry — single conversation entry with kind chip + rich body.

import { ATTACHMENT_FALLBACK_LABEL } from '@/lib/copy/attachments';
import { GLOSSARY } from '@/lib/copy/glossary';
import { formatRelativeTime } from '@/lib/format/datetime';
import {
  RichContentRenderer,
  type RichContentRendererProps,
  type TipTapDoc,
  UserChip,
} from '@ap/ui';
import type { ConversationEntry } from '@fops/shared';
import { OutlineBadge, type ReporterFacingStatusEnum, ReporterStatusBadge } from '@fops/ui';
import type * as React from 'react';
import { AttachmentChipList } from './AttachmentChip';

// ── Korean labels ────────────────────────────────────────────────────────────

const KIND_LABELS: Record<ConversationEntry['kind'], string> = {
  public_update: '공개 업데이트',
  reporter_reply: '제출자 답변',
  internal_comment: '내부 코멘트',
};

// Surface per entry kind: the SDK default (`public-update` for reporter_visible) would strip
// a Reporter Reply's attachmentRef before the name lookup.
const RENDERER_SURFACE: Record<
  ConversationEntry['kind'],
  NonNullable<RichContentRendererProps['surface']>
> = {
  public_update: 'public-update',
  reporter_reply: 'reporter-reply',
  internal_comment: 'internal-comment',
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface TimelineEntryProps {
  entry: ConversationEntry;
  actorDisplayName?: string | undefined;
  /** The signed-in actor, used as the display-name fallback when `actorDisplayName` is absent. */
  meActor?: { id: string; display_name: string } | null | undefined;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TimelineEntry({
  entry,
  actorDisplayName,
  meActor,
}: TimelineEntryProps): React.ReactElement {
  const actorUser: { display_name: string } =
    actorDisplayName !== undefined
      ? { display_name: actorDisplayName }
      : meActor?.id === entry.actor_id
        ? { display_name: meActor.display_name }
        : { display_name: GLOSSARY.unknownUser };

  const rendererMode = entry.kind === 'internal_comment' ? 'internal' : 'reporter_visible';
  const rendererSurface = RENDERER_SURFACE[entry.kind];

  const hasStatusTransition =
    entry.kind === 'public_update' &&
    typeof entry.reporter_facing_status_before === 'string' &&
    typeof entry.reporter_facing_status_after === 'string';

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border-subtle last:border-b-0">
      {/* Top row: actor chip + kind badge */}
      <div className="flex items-center justify-between gap-2">
        <UserChip user={actorUser} size="sm" sub={formatRelativeTime(entry.created_at)} />
        <OutlineBadge>{KIND_LABELS[entry.kind]}</OutlineBadge>
      </div>

      {/* Rich body */}
      <div className="pl-8">
        <RichContentRenderer
          doc={entry.body_rich_content as TipTapDoc}
          mode={rendererMode}
          surface={rendererSurface}
          attachments={entry.attachments}
          attachmentFallbackLabel={ATTACHMENT_FALLBACK_LABEL}
        />
        {/* PLAN-22 §Bug-2 (2026-05-22): per-entry linked attachments. */}
        <AttachmentChipList attachments={entry.attachments} />
      </div>

      {/* Status transition pair (public_update only) */}
      {hasStatusTransition && (
        <div className="pl-8 flex items-center gap-2 mt-1">
          <ReporterStatusBadge
            status={entry.reporter_facing_status_before as ReporterFacingStatusEnum}
          />
          <span className="text-text-muted text-xs">→</span>
          <ReporterStatusBadge
            status={entry.reporter_facing_status_after as ReporterFacingStatusEnum}
          />
        </div>
      )}
    </div>
  );
}
