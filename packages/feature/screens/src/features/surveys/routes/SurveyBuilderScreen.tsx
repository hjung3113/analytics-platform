// The Survey builder screen (data states, manage gate, Back with a dirty draft), free of the router so the standalone route and the
// platform bridge mount one definition (platform ADR-0071; #764 b). Title goes through the host seam; `onBack` is the host's (it decides
// the destination). A dirty draft is confirmed here for the screen's own Back control; leaving by any other path (browser back, menu
// switch) is the host's to guard: the standalone route adds a router blocker over `leaveGuard`; without one the draft is declared to the
// host seam's `useUnsavedGuard`, so the platform shell asks before a menu switch drops it (#2533).
// `canManage` is a display hint; the backend stays authoritative.

import { SurveyBuilder } from '../components/builder/SurveyBuilder';
import { useBuilderDirtyGuard } from '../components/builder/hooks/useBuilderDirtyGuard';
import { useSurvey } from '../hooks/useSurveys';
import { useSurveyManageGate } from './SurveyPermissionGate';
import { PERMISSION_BLOCKED_REASONS } from '../../../lib/copy/permission-reasons';
import { useManagedSystemNamesResult } from '../../../lib/cross-system/useManagedSystemNames';
import { formatRecordDocumentTitle } from '../../../lib/host/document-title-format';
import { useHostTitle, useHostUnsavedGuard } from '../../../lib/host/host-seam';
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

export type SurveyBuilderViewProps = Omit<SurveyBuilderScreenProps, 'surveyId'> & {
  /** The host's own read of the Survey. A host that already observes `useSurvey(surveyId)` passes it, so one key has one observer. */
  surveyQuery: ReturnType<typeof useSurvey>;
};

/** The screen over a Survey read the caller owns; calls no `useSurvey`. */
export function SurveyBuilderView({
  surveyQuery: query,
  onBack,
  leaveGuard,
}: SurveyBuilderViewProps): React.ReactElement {
  const ownGuard = useBuilderDirtyGuard();
  const { dirtyRef, setDirty } = leaveGuard ?? ownGuard;
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [hostDirty, setHostDirty] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  useHostUnsavedGuard(hostDirty && !leaveGuard);
  const onBackRef = React.useRef(onBack);
  React.useEffect(() => { onBackRef.current = onBack; });
  // A confirmed Back runs after the commit that dropped the host guard, so the shell does not ask a second time.
  React.useEffect(() => { if (leaving) { setLeaving(false); onBackRef.current(); } }, [leaving]);
  const reportDirty = React.useCallback((next: boolean) => { setDirty(next); setHostDirty(next); }, [setDirty]);
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
      <EmptyState title="설문을 찾을 수 없습니다." body="삭제되었거나 접근 권한이 없습니다." />
    );
  if (!gate.canManage)
    return (
      <div className="p-6">
        <PermissionBlockedPanel
          state="blocked_not_requestable"
          category="설문 빌더"
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
    setHostDirty(false);
    setLeaving(true);
  };

  return (
    <>
      <SurveyBuilder
        survey={query.data}
        canManage
        {...(gate.gateState ? { gateState: gate.gateState } : {})}
        managedSystemNamesById={managedSystemNamesById}
        onBack={handleBack}
        onDirtyChange={reportDirty}
      />
      <DirtyConfirmation
        open={confirmOpen}
        onConfirm={confirmBack}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

/** The bridge entry: a host that owns no Survey read gets the view over its own `useSurvey`. */
export function SurveyBuilderScreen({
  surveyId,
  ...rest
}: SurveyBuilderScreenProps): React.ReactElement {
  return <SurveyBuilderView surveyQuery={useSurvey(surveyId)} {...rest} />;
}
