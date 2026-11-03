// PublicVocDetail — one VOC as the public projection shows it (ADR-0110 decision 3): title, status with its stage line,
// description and the public updates with attachments. It renders `PublicVocView` and nothing else; reporter replies,
// internal comments and operator fields are not in that object, so there is nothing here to hide.

import { ATTACHMENT_FALLBACK_LABEL } from '@/lib/copy/attachments';
import { formatDateTime } from '@/lib/format/datetime';
import { type PublicVocView, isTipTapDocStructurallyEmpty } from '@ap/feature-shared';
import { ManagedSystemPill, ReporterStatusBadge } from '@ap/feature-ui';
import { PanelSectionTitle, PanelTitleBlock, RichContentRenderer, type TipTapDoc } from '@ap/ui';
import type * as React from 'react';
import { AttachmentChipList } from '../detail/AttachmentChip';
import { VocStageLine } from '../detail/VocStageLine';

export interface PublicVocDetailProps {
  voc: PublicVocView;
  variant?: 'page' | 'embedded';
}

export function PublicVocDetail({ voc, variant = 'page' }: PublicVocDetailProps): React.ReactElement {
  const embedded = variant === 'embedded';
  return (
    <div className={embedded ? 'flex flex-col p-4' : 'flex flex-col px-6 pt-7 pb-16'} data-testid="public-voc-detail">
      <div className="mb-4">
        <PanelTitleBlock title={voc.title} inset="none" className="mb-1" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">{voc.display_id}</span>
          <ManagedSystemPill name={voc.managed_system.name} />
          <ReporterStatusBadge status={voc.reporter_facing_status} />
        </div>
        <VocStageLine status={voc.reporter_facing_status} />
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <div className="flex gap-1"><dt>접수</dt><dd>{formatDateTime(voc.created_at)}</dd></div>
          <div className="flex gap-1"><dt>최근 변경</dt><dd>{formatDateTime(voc.updated_at)}</dd></div>
        </dl>
      </div>
      <div className="mt-4">
        <PanelSectionTitle>본문</PanelSectionTitle>
        <div className="rounded-md bg-surface-card-elevated p-4 text-sm text-text-secondary leading-relaxed">
          {isTipTapDocStructurallyEmpty(voc.description_rich_content) ? (
            <p className="text-text-muted">설명 없음</p>
          ) : (
            <RichContentRenderer doc={voc.description_rich_content as TipTapDoc} mode="reporter_visible" surface="voc-description"
              attachments={voc.attachments} attachmentFallbackLabel={ATTACHMENT_FALLBACK_LABEL} />
          )}
        </div>
        <AttachmentChipList attachments={voc.attachments} />
      </div>
      <div className="mt-8">
        <PanelSectionTitle>담당자 답변</PanelSectionTitle>
        {voc.entries.length === 0 ? (
          <p className="text-sm text-text-muted">아직 답변이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {voc.entries.map((entry) => (
              <li key={entry.id} className="rounded-md bg-surface-card-elevated p-4 text-sm text-text-secondary">
                <p className="mb-2 text-xs text-text-muted">{formatDateTime(entry.created_at)}</p>
                <RichContentRenderer doc={entry.body_rich_content as TipTapDoc} mode="reporter_visible" surface="public-update"
                  attachments={entry.attachments} attachmentFallbackLabel={ATTACHMENT_FALLBACK_LABEL} />
                <AttachmentChipList attachments={entry.attachments} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
