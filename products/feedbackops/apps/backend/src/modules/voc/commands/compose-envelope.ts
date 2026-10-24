import { operatorOnlyVocFields } from '../reporter-projection.js';
import type { VocEnvelope } from '../service.js';
// Shared VOC mutation envelope projection.
import type { ReporterFacingStatus } from '../transitions.js';

export function composeEnvelope(
  row: {
    id: string;
    displayId: string;
    workspaceId: string;
    primaryManagedSystemId: string;
    analyticsAreaId: string | null;
    reporterId: string;
    title: string;
    descriptionRichContent: unknown;
    severity: Exclude<VocEnvelope['severity'], undefined>;
    reporterFacingStatus: string;
    triageState: VocEnvelope['triage_state'];
    ownerUserId: string | null;
    ownerTeamId: string | null;
    sourceContext: string;
    createdAt: Date;
    updatedAt: Date;
  },
  nextStates: {
    allowed: ReporterFacingStatus[];
    forbidden: Partial<Record<ReporterFacingStatus, string>>;
  },
  isReporterArm = false,
): VocEnvelope {
  return {
    id: row.id,
    display_id: row.displayId,
    workspace_id: row.workspaceId,
    primary_managed_system_id: row.primaryManagedSystemId,
    reporter_id: row.reporterId,
    title: row.title,
    description_rich_content: row.descriptionRichContent,
    ...operatorOnlyVocFields(row, isReporterArm),
    reporter_facing_status: row.reporterFacingStatus as ReporterFacingStatus,
    triage_state: row.triageState,
    source_context: row.sourceContext,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    next_actions: [],
    next_reporter_states: nextStates,
    permission_decisions: {},
  };
}
