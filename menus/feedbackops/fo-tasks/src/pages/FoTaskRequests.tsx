import type { ComponentProps } from 'react';
import { PlatformPage } from '@ap/components';
import { FoBridge, FoDetailDrawer, RejectedPage, operatorHostLinks, taskRequestsRoute, useTaskRequestsHere, useTaskRequestsSearch } from '@ap/fo-bridge';
import { TaskRequestsScreen } from '@fops/frontend/operator-screens/task-requests';
import { useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** The screen owns the close (focus return, `param` cleared through the seam), so the drawer's close is `requestClose`. Unkeyed: one drawer lifetime spans a queue advance. */
const renderDetail: ComponentProps<typeof TaskRequestsScreen>['renderDetail'] = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Task Requests (ADR-0081, #763): FeedbackOps' request queue through the bridge; `focus` is the selected request, its panel renders in the shell detail slot. */
export default function FoTaskRequests() {
  const rejected = useRejectedValue(taskRequestsRoute);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useTaskRequestsSearch} useHere={useTaskRequestsHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><TaskRequestsScreen autoSelect={false} renderDetail={renderDetail} /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
