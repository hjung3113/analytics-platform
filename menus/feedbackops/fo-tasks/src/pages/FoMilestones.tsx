import type { ComponentProps } from 'react';
import { PlatformPage } from '@ap/components';
import { FoBridge, FoDetailDrawer, RejectedPage, milestonesRoute, operatorHostLinks, useMilestonesHere, useMilestonesSearch } from '@ap/fo-bridge';
import { MilestonesScreen } from '@fops/frontend/operator-screens/milestones';
import { useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** The screen owns the close (the dirty-draft guard lives in `requestClose`), so the drawer's close is `requestClose`. Unkeyed: detail and create parts are different slot components, so each remounts anyway. */
const renderDetail: ComponentProps<typeof MilestonesScreen>['renderDetail'] = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Milestones (ADR-0081, #763): FeedbackOps' Milestone screen through the bridge; `focus` is the selected Milestone, detail and create render in the shell detail slot. */
export default function FoMilestones() {
  const rejected = useRejectedValue(milestonesRoute);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useMilestonesSearch} useHere={useMilestonesHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><MilestonesScreen renderDetail={renderDetail} /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
