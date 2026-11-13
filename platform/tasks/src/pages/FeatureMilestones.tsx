import type { ComponentProps } from 'react';
import { FeatureDetailDrawer, FeatureScreenPage, isUuid, milestonesRoute, useMilestonesHere, useMilestonesSearch } from '@ap/feature-bridge';
import { MilestonesScreen } from '@ap/feature-screens/operator-screens/milestones';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';

/** `focus` becomes the feature `param`, a request path segment, so only a UUID passes (06 §6.4, ADR-0071 decision 9); other keys follow the Tasks search schema. */
const isValid = (key: string, value: string) => key === 'param' ? isUuid(value) : isTasksSearchValueValid(key, value);

/** The screen owns the close (the dirty-draft guard lives in `requestClose`), so the drawer's close is `requestClose`. Unkeyed: detail and create parts are different slot components, so each remounts anyway. */
const renderDetail: ComponentProps<typeof MilestonesScreen>['renderDetail'] = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Milestones (ADR-0081, #763): the feature screens' Milestone screen through the bridge; `focus` is the selected Milestone (a UUID; `managedSystem` a UUID or `all`), detail and create render in the shell detail slot. */
export default function FeatureMilestones() {
  return <FeatureScreenPage route={milestonesRoute} isValid={isValid} useSearch={useMilestonesSearch} useHere={useMilestonesHere}><MilestonesScreen renderDetail={renderDetail} /></FeatureScreenPage>;
}
