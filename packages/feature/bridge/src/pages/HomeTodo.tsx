import { usePlatform } from '@ap/kernel';
import { HomeTodoPanel } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '../feature/FeatureBridge';
import { permissionRequestsRoute } from '../feature/admin-routes';
import { hostLinks, notificationsTarget, permissionRequestsTarget } from '../feature/links';
import { surveyTarget } from '../feature/survey-links';
import { triageRoute } from '../feature/voc-routes';
import { vocTarget } from '../feature/voc-links';

// Module level: `FeatureBridge` memoizes its seam on these two identities.
const HOME_TODO_LINKS = hostLinks(
  surveyTarget,
  vocTarget,
  triageRoute.target,
  permissionRequestsTarget,
  permissionRequestsRoute.target,
  notificationsTarget,
);

/** The home `내 할 일` (ADR-0070 decision 8): the feature screens' panel through the bridge. Mounted only by `home-todo-slot.tsx` in a ready session, so it has no `실서버 필요` state of its own. */
export default function HomeTodo() {
  const { can } = usePlatform();
  const canAccessFeatures = can('features:access');
  const canReviewPermissionRequests = canAccessFeatures && can('console:access');
  return (
    <FeatureBridge targetOf={HOME_TODO_LINKS.targetOf} Link={HOME_TODO_LINKS.Link}>
      <HomeTodoPanel
        canAccessFeatures={canAccessFeatures}
        canReviewPermissionRequests={canReviewPermissionRequests}
      />
    </FeatureBridge>
  );
}
