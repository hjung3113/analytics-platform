import type { ComponentProps } from 'react';
import { FeatureDetailDrawer, FeatureScreenPage, isUuid, taskRequestsRoute, useTaskRequestsHere, useTaskRequestsSearch } from '@ap/feature-bridge';
import { TaskRequestsScreen } from '@ap/feature-screens/operator-screens/task-requests';
import { isTasksSearchValueValid } from '@ap/feature-screens/operator-screens/tasks-search';

/** `focus` becomes the feature `param`, a request path segment, so only a UUID passes (06 §6.4, ADR-0071 decision 9); other keys follow the Tasks search schema. */
const isValid = (key: string, value: string) => key === 'param' ? isUuid(value) : isTasksSearchValueValid(key, value);

/** The screen owns the close (focus return, `param` cleared through the seam), so the drawer's close is `requestClose`. Unkeyed: one drawer lifetime spans a queue advance. */
const renderDetail: ComponentProps<typeof TaskRequestsScreen>['renderDetail'] = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Task Requests (ADR-0081, #763): the feature screens' request queue through the bridge; `focus` is the selected request (a UUID; `managedSystem` a UUID or `all`), its panel renders in the shell detail slot. */
export default function FeatureTaskRequests() {
  return <FeatureScreenPage route={taskRequestsRoute} isValid={isValid} useSearch={useTaskRequestsSearch} useHere={useTaskRequestsHere}>
    <TaskRequestsScreen autoSelect={false} renderDetail={renderDetail} titleInHeader />
  </FeatureScreenPage>;
}
