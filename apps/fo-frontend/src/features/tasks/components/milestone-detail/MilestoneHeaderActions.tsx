import { useHostSeam } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import { DetailPanelHeaderActions } from '@fops/ui';
import type * as React from 'react';

/** The copy-link / more actions; the copy URL is the host's address of the Milestone, so a host without one shows no actions. */
export function MilestoneHeaderActions({
  milestoneId,
}: {
  milestoneId: string;
}): React.ReactElement | null {
  const { absoluteHref, notifyError, notifySuccess } = useHostSeam();
  const copyUrl =
    absoluteHref?.(searchHref('/tasks', { view: 'milestones', param: milestoneId })) ?? null;
  if (copyUrl === null) return null;
  return (
    <DetailPanelHeaderActions
      entityKind="milestone"
      entityId={milestoneId}
      copyUrl={copyUrl}
      notify={{ success: notifySuccess, error: notifyError }}
    />
  );
}
