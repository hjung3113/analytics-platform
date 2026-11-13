// TriageBlock — read-only triage fields; edits happen in the triage console (#363).

import { TRIAGE_STATE_LABELS } from '@/lib/copy/enum-labels';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import { shortId } from '@/lib/identity';
import { GLOSSARY } from '@/lib/copy/glossary';
import type { VocDetailEnvelope } from '@ap/feature-shared';
import { SeverityBadge, UnassignedBadge } from '@ap/feature-ui';
import { Button, FieldRow, PanelSectionTitle, UserChip, cn } from '@ap/ui';
import type * as React from 'react';

export interface TriageBlockProps {
  voc: VocDetailEnvelope;
  /** The host places this section at the top of its properties track. */
  leading?: boolean;
  ownerTeamName?: string | null | undefined;
  ownerDisplayName?: string | null | undefined;
  analyticsAreaName?: string | null | undefined;
  canTriage: boolean;
  /** Absent when the host has nowhere to open the triage console: the button is left out. */
  onOpenTriage?: (() => void) | undefined;
}

export function TriageBlock({
  voc,
  leading = false,
  ownerDisplayName,
  ownerTeamName,
  analyticsAreaName,
  canTriage,
  onOpenTriage,
}: TriageBlockProps): React.ReactElement {
  return (
    <div className={cn(!leading && 'mt-8')}>
      <div className={cn('flex items-center justify-between', leading && 'mb-4 gap-2')}>
        <PanelSectionTitle {...(leading ? { className: 'mb-0' } : {})}>
          분류 (읽기 전용)
        </PanelSectionTitle>
        {canTriage && onOpenTriage !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="triage-open-console"
            onClick={onOpenTriage}
          >
            분류에서 변경
          </Button>
        )}
      </div>

      {/* 심각도 */}
      <FieldRow label="심각도" inset="none">
        {voc.severity != null ? (
          <SeverityBadge severity={voc.severity} />
        ) : (
          <span className="text-text-muted text-sm">미설정</span>
        )}
      </FieldRow>

      {/* 담당자 */}
      <FieldRow label="담당자" inset="none">
        {voc.owner_user_id !== null ? (
          <UserChip user={{ display_name: ownerDisplayName ?? GLOSSARY.owner }} size="sm" />
        ) : voc.owner_team_id != null ? (
          <span className="text-sm text-text-primary">
            {RESPONSIBILITY_COPY.teamMark} · {ownerTeamName ?? `팀 ${shortId(voc.owner_team_id)}`}
          </span>
        ) : (
          <UnassignedBadge />
        )}
      </FieldRow>

      {/* Analytics Area */}
      <FieldRow label="분석 영역" inset="none">
        {voc.analytics_area_id !== null ? (
          <span className="text-sm text-text-primary">{analyticsAreaName ?? '분석 영역'}</span>
        ) : (
          <span className="text-sm text-text-warning">미지정</span>
        )}
      </FieldRow>

      {/* Triage 상태 */}
      <FieldRow label="분류 상태" inset="none">
        <span className="text-sm text-text-primary">{TRIAGE_STATE_LABELS[voc.triage_state]}</span>
      </FieldRow>
    </div>
  );
}
