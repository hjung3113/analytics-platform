/**
 * TriageRow — 96px expanded row for the triage queue.
 *
 * Prototype ref: screen-voc-create.jsx:363-391 (TriageQueueRow)
 * Layout: SeverityIndicator | row-body[title + row-meta] | row-trailing[createdAt]
 *
 * Missing owners use the shared danger badge; the missing-area label stays neutral.
 *
 * Token translations (PROTOTYPE-TO-PACK17.md §3.8):
 *   .object-row.expanded → min-h-row-expanded py-3.5 px-5
 *   .object-row.selected::before → `RowSelectionBar` (@ap/ui)
 *   .row-body → flex flex-col min-w-0 gap-0.5
 *   .row-title → text-sm font-medium text-text-primary truncate
 *   .row-meta → `row-meta` (@ap/ui) text-xs flex items-center gap-2 flex-wrap
 *   .row-meta .dot → w-0.5 h-0.5 rounded-full bg-text-disabled
 *   .row-trailing → flex items-center gap-2 shrink-0
 *   Semantic row color is limited to SeverityIndicator and ReporterStatusBadge.
 */

import { FeatureTimestamp } from '../../../../components/FeatureTimestamp';
import type { VocListItem } from '@ap/feature-shared';
import { ReporterStatusBadge, UnassignedBadge } from '../../../../ui/index';
import { RowSelectionBar, SeverityIndicator, cn } from '@ap/ui';
import { useId } from 'react';
import type * as React from 'react';

import { VOC_TRIAGE_TAB_LABELS } from '../../../../lib/copy/voc-views';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TriageRowProps {
  voc: VocListItem;
  selected: boolean;
  onSelect: () => void;
  className?: string;
  showPostponedMarker?: boolean;
  /** Neutralizes the unassigned cue in the Triage unassigned tab only. */
  unassignedBadgeTone?: 'danger' | 'neutral';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TriageRow({
  voc,
  selected,
  onSelect,
  className,
  showPostponedMarker = true,
  unassignedBadgeTone,
}: TriageRowProps): React.ReactElement {
  const metaId = useId();
  const ownerMissing = voc.owner_user_id === null && voc.owner_team_id === null;
  const areaMissing = voc.analytics_area_id === null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-redundant-roles, jsx-a11y/role-supports-aria-props -- the row keeps its explicit button role and aria-selected: the list selection contract and existing role queries depend on it
    <button
      type="button"
      role="button"
      aria-selected={selected}
      data-list-row=""
      data-selected={selected ? '' : undefined}
      aria-label={`${voc.display_id} ${voc.title}`}
      aria-describedby={metaId}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={cn(
        // Base layout — .object-row.expanded (§3.8)
        'group/triage-row relative flex w-full items-center gap-3 min-h-row-expanded py-3.5 px-5 text-left',
        // Bottom border
        'border-b border-border-subtle',
        // Hover only on unselected rows so the selected surface stays under the pointer (#2485)
        !selected && 'hover:bg-surface-row-hover',
        // Selected state
        selected && 'bg-surface-row-selected',
        className,
      )}
    >
      {/* Shared 2px selection marker; severity retains its separate pill. */}
      {selected && <RowSelectionBar data-testid="triage-row-selected-bar" />}
      {/* LEFT: severity indicator — 3px × 16px pill (§3.2) */}
      <div className="flex items-center shrink-0">
        {voc.severity !== undefined && <SeverityIndicator severity={voc.severity} />}
      </div>

      {/* BODY: title + meta — .row-body (§3.8) */}
      <div className="flex flex-col min-w-0 gap-0.5 flex-1">
        {/* Title row — .row-title */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
          <span className="font-mono text-xs text-text-disabled tabular-nums whitespace-nowrap shrink-0 max-w-full truncate" title={voc.display_id}>
            {voc.display_id}
          </span>
          <span className="min-w-0 flex-1 truncate">{voc.title}</span>
        </div>

        {/* Meta row — .row-meta */}
        <div id={metaId} className="row-meta flex items-center gap-2 text-xs flex-wrap">
          <ReporterStatusBadge status={voc.reporter_facing_status} />

          {showPostponedMarker && voc.review_postponed_at != null && (
            <>
              <span
                className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0"
                aria-hidden="true"
              />
              <span className="row-meta">{VOC_TRIAGE_TAB_LABELS.waiting}</span>
            </>
          )}

          {areaMissing && (
            <>
              <span
                className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0"
                aria-hidden="true"
              />
              <span className="row-meta">분석 영역 미지정</span>
            </>
          )}

          {ownerMissing && (
            <>
              <span
                className="w-0.5 h-0.5 rounded-full bg-text-disabled shrink-0"
                aria-hidden="true"
              />
              <UnassignedBadge tone={unassignedBadgeTone ?? 'danger'} />
            </>
          )}
        </div>
      </div>

      {/* TRAILING: created-at — .row-trailing */}
      <div className="flex items-center shrink-0">
        <span className="row-meta text-xs"><FeatureTimestamp at={voc.created_at} notation="list" /></span>
      </div>
    </button>
  );
}

TriageRow.displayName = 'TriageRow';
