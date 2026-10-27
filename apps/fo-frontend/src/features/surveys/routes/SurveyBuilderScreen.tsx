// The Survey builder screen (data states, manage gate, Back with a dirty draft), free of the router so the standalone route and the
// platform bridge mount one definition (platform ADR-0071; #764 b). Title goes through the host seam; `onBack` is the host's (it decides
// the destination). A dirty draft is confirmed here for the screen's own Back control; leaving by any other path (browser back, menu
// switch) is the host's to guard: the standalone route adds a router blocker over `leaveGuard`, the bridge accepts the loss (plan D3).
// `canManage` is a display hint; the backend stays authoritative.

import { SurveyBuilder } from '@/features/surveys/components/builder/SurveyBuilder';
import { useBuilderDirtyGuard } from '@/features/surveys/components/builder/hooks/useBuilderDirtyGuard';
import { useSurvey } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { formatRecordDocumentTitle } from '@/lib/host/document-title-format';
import { useHostTitle } from '@/lib/host/host-seam';
import { DirtyConfirmation, EmptyState, PermissionBlockedPanel } from '@ap/ui';
import * as React from 'react';

export type SurveyBuilderLeaveGuard = ReturnType<typeof useBuilderDirtyGuard>;

export type SurveyBuilderScreenProps = {
  surveyId: string;
  /** Where Back (and a successful launch) goes; the host decides. */
  onBack: () => void;
  /** The host's own dirty guard, when it must read the draft state (the standalone route's router blocker). Absent = the screen keeps its own. */
  leaveGuard?: SurveyBuilderLeaveGuard;
};

export function SurveyBuilderScreen({
  surveyId,
  onBack,
  leaveGuard,
}: SurveyBuilderScreenProps): React.ReactElement {
  const ownGuard = useBuilderDirtyGuard();
  const { dirtyRef, setDirty } = leaveGuard ?? ownGuard;
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const query = useSurvey(surveyId);
  const gate = useSurveyManageGate(query.data?.primary_managed_system_id);
  const managedSystemNames = useManagedSystemNamesResult();
  const managedSystemNamesById = managedSystemNames.isSuccess
    ? managedSystemNames.namesById
    : undefined;
  useHostTitle(
    query.isSuccess && !query.isFetching && gate.canManage
      ? formatRecordDocumentTitle({
          displayId: query.data.display_id,
          title: query.data.title,
        })
      : null,
  );

  if (query.isLoading) return <div className="p-6 text-sm text-text-muted">불러오는 중…</div>;
  if (query.isError || !query.data)
    return (
      <EmptyState title="Survey를 찾을 수 없습니다." body="삭제되었거나 접근 권한이 없습니다." />
    );
  if (!gate.canManage)
    return (
      <div className="p-6">
        <PermissionBlockedPanel
          state="blocked_not_requestable"
          category="Survey 빌더"
          reason={PERMISSION_BLOCKED_REASONS.surveyBuilder}
        />
      </div>
    );

  const handleBack = (): void => {
    if (dirtyRef.current) setConfirmOpen(true);
    else onBack();
  };
  const confirmBack = (): void => {
    setConfirmOpen(false);
    // Clears the guard first, so a host blocker lets the navigation through.
    setDirty(false);
    onBack();
  };

  return (
    <>
      <SurveyBuilder
        survey={query.data}
        canManage
        {...(gate.gateState ? { gateState: gate.gateState } : {})}
        managedSystemNamesById={managedSystemNamesById}
        onBack={handleBack}
        onDirtyChange={setDirty}
      />
      <DirtyConfirmation
        open={confirmOpen}
        onConfirm={confirmBack}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
