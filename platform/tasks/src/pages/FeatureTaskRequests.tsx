import type { ComponentProps } from 'react';
import { FeatureDetailDrawer, FeatureScreenPage, taskRequestsRoute, useTaskRequestsHere, useTaskRequestsSearch } from '@ap/feature-bridge';
import { TaskRequestsScreen } from '@ap/feature-screens/operator-screens/task-requests';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';

/** The screen owns the close (focus return, `param` cleared through the seam), so the drawer's close is `requestClose`. Unkeyed: one drawer lifetime spans a queue advance. */
const renderDetail: ComponentProps<typeof TaskRequestsScreen>['renderDetail'] = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Task Requests (ADR-0081, #763): the feature screens' request queue through the bridge; `focus` is the selected request (any string for the feature screens' Tasks search schema; `managedSystem` a UUID or `all`), its panel renders in the shell detail slot. */
export default function FeatureTaskRequests() {
  return <FeatureScreenPage route={taskRequestsRoute} isValid={isTasksSearchValueValid} useSearch={useTaskRequestsSearch} useHere={useTaskRequestsHere}>
    <TaskRequestsScreen autoSelect={false} renderDetail={renderDetail} titleInHeader />
  </FeatureScreenPage>;
}
