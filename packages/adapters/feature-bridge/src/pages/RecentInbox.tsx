import { InboxPanel } from '@fops/frontend/global-screens/inbox-panel';
import { FoBridge } from '../fo/FoBridge';

/** The rail bell's recent popover body: FeedbackOps' `InboxPanel` (`recent` variant). Loaded lazily by `notifications-slot.tsx`, so none of the panel is in the start chunk. */
export default function RecentInbox() {
  return <FoBridge><InboxPanel variant="recent" /></FoBridge>;
}
