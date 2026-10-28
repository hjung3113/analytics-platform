import type { ComponentProps } from 'react';
import { FeatureDetailDrawer, FeatureScreenPage, milestonesRoute, useMilestonesHere, useMilestonesSearch } from '@ap/feature-bridge';
import { MilestonesScreen } from '@ap/feature-screens/operator-screens/milestones';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';

/** The screen owns the close (the dirty-draft guard lives in `requestClose`), so the drawer's close is `requestClose`. Unkeyed: detail and create parts are different slot components, so each remounts anyway. */
const renderDetail: ComponentProps<typeof MilestonesScreen>['renderDetail'] = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Milestones (ADR-0081, #763): FeedbackOps' Milestone screen through the bridge; `focus` is the selected Milestone (any string for FeedbackOps' Tasks search schema; `managedSystem` a UUID or `all`), detail and create render in the shell detail slot. */
export default function FoMilestones() {
  return <FeatureScreenPage route={milestonesRoute} isValid={isTasksSearchValueValid} useSearch={useMilestonesSearch} useHere={useMilestonesHere}><MilestonesScreen renderDetail={renderDetail} /></FeatureScreenPage>;
}
