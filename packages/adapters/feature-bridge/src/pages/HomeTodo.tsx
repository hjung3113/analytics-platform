import { HomeTodoPanel } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '../fo/FeatureBridge';
import { hostLinks, permissionRequestsTarget } from '../fo/links';
import { surveyTarget } from '../fo/survey-links';
import { vocTarget } from '../fo/voc-links';

// Module level: `FeatureBridge` memoizes its seam on these two identities.
const HOME_TODO_LINKS = hostLinks(surveyTarget, vocTarget, permissionRequestsTarget);

/** The home `내 할 일` (ADR-0070 decision 8): FeedbackOps' panel through the bridge. Mounted only by `home-todo-slot.tsx` in a ready session, so it has no `실서버 필요` state of its own. */
export default function HomeTodo() {
  return <FeatureBridge canLink={HOME_TODO_LINKS.canLink} Link={HOME_TODO_LINKS.Link}><HomeTodoPanel /></FeatureBridge>;
}
